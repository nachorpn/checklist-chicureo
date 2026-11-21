/* Gestark · cliente de datos centralizados · Supabase Auth + RLS.
   Este módulo nunca usa las credenciales locales Gestark como prueba de identidad.
*/
(function(root){
 'use strict';
 const cfg=root.GestarkDBConfig||{};
 const configured=cfg.enabled===true && /^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i.test(String(cfg.url||''))
   && /^sb_publishable_[A-Za-z0-9_-]+$/.test(String(cfg.publishableKey||''));
 let client=null, loading=null, profile=null;
 function loadScript(url){
   return new Promise((resolve,reject)=>{
     const s=document.createElement('script');s.src=url;s.async=true;
     s.onload=()=>resolve();s.onerror=()=>reject(Error('No se pudo descargar el cliente de base de datos'));
     document.head.appendChild(s);
   });
 }
 async function init(){
   if(!configured)throw Error('La base central aún no está configurada');
   if(client)return client;
   if(loading)return loading;
   loading=(async()=>{
     if(!root.supabase?.createClient){
       try{await loadScript('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js')}
       catch(_){await loadScript('https://unpkg.com/@supabase/supabase-js@2/dist/umd/supabase.js')}
     }
     if(!root.supabase?.createClient)throw Error('No fue posible iniciar Supabase Auth');
     client=root.supabase.createClient(String(cfg.url).replace(/\/$/,''),cfg.publishableKey,{
       auth:{autoRefreshToken:true,persistSession:true,detectSessionInUrl:false,storageKey:'gestark:contingency:supabase:v1'},
       global:{headers:{'X-Client-Info':'gestark-contingency-v19'}}
     });
     return client;
   })();
   try{return await loading}finally{loading=null}
 }
 function check(error){if(error)throw Error(error.message||'Error de conexión con base de datos')}
 async function sessionUser(){
   const c=await init();const {data,error}=await c.auth.getUser();check(error);
   return data?.user||null;
 }
 async function authorize(gestarkUsername){
   const c=await init(),user=await sessionUser();
   if(!user){profile=null;return null}
   const {data,error}=await c.from('gestark_members')
     .select('user_id,gestark_username,display_name,role,active')
     .eq('user_id',user.id).maybeSingle();check(error);
   if(!data?.active||data.gestark_username!==gestarkUsername){
     profile=null;throw Error('La cuenta de base de datos no está autorizada para este usuario Gestark');
   }
   profile=data;return data;
 }
 async function signIn(email,password,gestarkUsername){
   const c=await init();
   const {error}=await c.auth.signInWithPassword({email,password});check(error);
   try{return await authorize(gestarkUsername)}
   catch(e){await c.auth.signOut();throw e}
 }
 async function signOut(){profile=null;if(client)await client.auth.signOut()}
 function requireProfile(){if(!profile?.active)throw Error('Conecta una cuenta autorizada de base de datos')}
 function transform(d){return {
   id:'CONT-'+String(d.id).toUpperCase(),dbid:d.id,of:d.of,
   at:Date.parse(d.created_at),user:d.created_by_username,operator:d.operator_name||d.created_by_username,status:d.status,
   reason:d.reason,site:d.site,
   regularizedAt:d.regularized_at?Date.parse(d.regularized_at):undefined
 }}
 async function list(){requireProfile();const c=await init();
   const {data,error}=await c.from('contingency_deliveries')
     .select('id,of,created_at,created_by_username,operator_name,status,reason,site,regularized_at')
     .order('created_at',{ascending:false}).limit(1000);
   check(error);return (data||[]).map(transform).reverse();
 }
 async function confirm(record,receiver,signature,notes){requireProfile();const c=await init();
   const body={p_id:String(record.id).replace(/^CONT-/i,'').toLowerCase(),p_of:record.of,
      p_name:receiver.name,p_rut:receiver.rut,p_signature:signature,
      p_site:record.site,p_reason:record.reason,p_note:notes||''};
   const {data,error}=await c.rpc('gestark_confirm_delivery',body);check(error);
   if(!data)throw Error('La base de datos no devolvió confirmación');
   return transform(data);
 }
 async function regularize(id){requireProfile();const c=await init();
   const {data,error}=await c.rpc('gestark_regularize_delivery',{p_id:String(id).replace(/^CONT-/i,'').toLowerCase()});
   check(error);return transform(data);
 }
 async function evidence(id){requireProfile();const c=await init();
   const {data,error}=await c.from('contingency_evidence')
     .select('receiver_name,receiver_rut,signature_png')
     .eq('delivery_id',String(id).replace(/^CONT-/i,'').toLowerCase()).single();
   check(error);return data;
 }
 root.GestarkDB=Object.freeze({configured,init,authorize,signIn,signOut,list,confirm,regularize,evidence});
})(window);
