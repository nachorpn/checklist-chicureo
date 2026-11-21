/* Gestark · Transferencias v2026.11.21.23. Conserva notas CIBC v1 y lee cobros de contingencia locales. */
(()=>{
'use strict';
const ALLOWED_USER='CIBC', PERSONAL_KEY='gestark:notas-transferencias:v1:CIBC',QUEUE_KEY='gestark:contingency:payments:v1';
const $=id=>document.getElementById(id),fmt=new Intl.NumberFormat('es-CL',{style:'currency',currency:'CLP',maximumFractionDigits:0});
let active=false,currentUser='',manual=[],queue=[],toastTimeout=null;
function cash(n){return fmt.format(n).replace(/\s/g,' ')}
function nameKey(s){return String(s).normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ').trim().toLocaleLowerCase('es-CL')}
function parseAmount(v){const raw=String(v||'').trim(),digits=raw.replace(/[^0-9]/g,'');const amount=Number(digits);return /^[\d\s.$]+$/.test(raw)&&digits&&Number.isSafeInteger(amount)&&amount>0&&amount<=999999999?amount:null}
function dateISO(){const v=new Intl.DateTimeFormat('en-US',{timeZone:'America/Santiago',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());const g=k=>v.find(x=>x.type===k)?.value||'';return g('year')+'-'+g('month')+'-'+g('day')}
function toast(msg,error=false){const e=$('feedback');e.textContent=msg;e.classList.toggle('error',error);clearTimeout(toastTimeout);toastTimeout=setTimeout(()=>{e.textContent='';e.classList.remove('error')},3800)}
function loadManual(){if(currentUser!==ALLOWED_USER)return [];try{const data=JSON.parse(localStorage.getItem(PERSONAL_KEY)||'[]');return Array.isArray(data)?data.filter(x=>x&&typeof x.name==='string'&&Number.isSafeInteger(x.amount)&&x.amount>0&&typeof x.id==='string').slice(-1500):[]}catch{return []}}
function loadQueue(){try{const data=JSON.parse(localStorage.getItem(QUEUE_KEY)||'[]');return Array.isArray(data)?data.filter(x=>x&&typeof x.of==='string'&&/^\d{9}$/.test(x.of)&&Number.isSafeInteger(x.amount)&&x.amount>0&&['transfer','cash'].includes(x.method)&&typeof x.id==='string').slice(-3000):[]}catch{return []}}
function persistManual(arr){try{localStorage.setItem(PERSONAL_KEY,JSON.stringify(arr));manual=arr;render();return true}catch{toast('No se pudo guardar la lista manual.',true);return false}}
function persistQueue(arr){try{localStorage.setItem(QUEUE_KEY,JSON.stringify(arr));queue=arr;render();return true}catch{toast('No se pudo actualizar el registro de cobros.',true);return false}}
function bankQueue(){
 // No incluir órdenes ya existentes en notas personales antiguas (las de v22).
 const legacyOF=new Set(manual.flatMap(x=>[x.sourceOF,...(Array.isArray(x.sources)?x.sources.map(s=>s.of):[])]).filter(Boolean));
 return queue.filter(x=>x.method==='transfer'&&!legacyOF.has(x.of));
}
function bankRows(){
 const grouped=new Map();
 function add(name,amount,source){const key=nameKey(name);if(!key||!Number.isSafeInteger(amount)||amount<=0)return;
  const old=grouped.get(key);if(old){old.amount+=amount;old.sources.push(source)}else grouped.set(key,{name,amount,sources:[source]})}
 for(const x of manual)add(x.name,x.amount,'manual');
 for(const x of bankQueue())add(x.payer,x.amount,x.of);
 return [...grouped.values()];
}
function dateStr(iso){const m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(iso||'');return m?m[3]+'/'+m[2]+'/'+m[1]:iso||''}
function cashEntries(){return queue.filter(x=>x.method==='cash')}
function el(tag,cls,text){const e=document.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=String(text);return e}
function appendRow(root,name,amount,meta,actions=[]){const li=el('li','entry');const row=el('div','entry-row'),info=el('div','entry-info');
 info.append(el('div','entry-name',name),el('div','entry-meta',meta));row.append(info,el('span','entry-amount',cash(amount)));li.append(row);
 if(actions.length){const d=el('div','entry-actions');for(const a of actions)d.append(a);li.append(d)}root.append(li);return li}
function manualActions(item){
 const add=el('button','micro','+ Sumar monto');add.type='button';const remove=el('button','micro danger','Eliminar');remove.type='button';
 const form=el('form','add-form');form.hidden=true;const inp=el('input');inp.inputMode='numeric';inp.required=true;inp.placeholder='Monto adicional';inp.maxLength=12;
 const btn=el('button','micro','Sumar');btn.type='submit';const cancel=el('button','micro','Cancelar');cancel.type='button';form.append(inp,btn,cancel);
 add.addEventListener('click',()=>{form.hidden=!form.hidden;if(!form.hidden)inp.focus()});cancel.addEventListener('click',()=>{form.hidden=true;inp.value='' });
 form.addEventListener('submit',e=>{e.preventDefault();const n=parseAmount(inp.value);if(!n){toast('Monto adicional inválido.',true);return}const i=manual.findIndex(x=>x.id===item.id);if(i<0)return;
 const old=manual[i];if(old.amount+n>999999999){toast('El total excede $999.999.999.',true);return}const parts=Array.isArray(old.parts)&&old.parts.length?old.parts:[old.amount];
 if(persistManual(manual.map((x,j)=>j===i?{...old,amount:old.amount+n,parts:[...parts,n]}:x)))toast('Monto sumado ✓')});
 remove.addEventListener('click',()=>{if(confirm('¿Eliminar la transferencia manual de '+item.name+'?'))persistManual(manual.filter(x=>x.id!==item.id))});
 return {actions:[add,remove],form}
}
function render(){if(!active)return;
 const bank=bankRows();$('record-count').textContent=bank.length+' '+(bank.length===1?'cliente':'clientes');$('record-total').textContent=cash(bank.reduce((a,x)=>a+x.amount,0));
 for(const b of ['copy-excel','send-wa'])$(b).disabled=bank.length===0;
 $('empty').hidden=bank.length>0;$('entries').replaceChildren();
 for(const x of [...manual].reverse()){
   const {actions,form}=manualActions(x);const li=appendRow($('entries'),x.name,x.amount,'Manual · '+dateStr(x.date)+(Array.isArray(x.sources)&&x.sources.length?' · Entregas previas vinculadas':''),actions);li.append(form);
 }
 const auto=bankQueue();for(const x of [...auto].reverse())appendRow($('entries'),x.payer,x.amount,'Entrega contingente · O.F. '+x.of+' · '+(x.user||'Gestark')+' · pendiente de verificar');
 $('manual-clear-wrap').hidden=!manual.length||currentUser!==ALLOWED_USER;
 $('auto-transfer-clear-wrap').hidden=!auto.length;
 const cashList=cashEntries();$('cash-count').textContent=cashList.length+' '+(cashList.length===1?'cobro':'cobros');$('cash-total').textContent=cash(cashList.reduce((a,x)=>a+x.amount,0));
 $('cash-entries').replaceChildren();$('cash-empty').hidden=cashList.length>0;$('clear-auto-cash').hidden=!cashList.length;
 for(const x of [...cashList].reverse())appendRow($('cash-entries'),x.payer,x.amount,'O.F. '+x.of+' · '+(x.user||'Gestark')+' · efectivo recibido');
}
function excel(){return bankRows().map(x=>x.name.replace(/[\t\r\n]+/g,' ').replace(/^([=+\-@])/,'\'$1')+'\t'+String(x.amount)+'\tno').join('\n')}
function message(){const bank=bankRows();const lines=['*Transferencias pendientes*',''];for(const x of bank)lines.push('• '+x.name+' — '+cash(x.amount));lines.push('','*Total: '+cash(bank.reduce((a,x)=>a+x.amount,0))+'*','Registros: '+bank.length);return lines.join('\n')}
async function copy(text){if(navigator.clipboard?.writeText){try{await navigator.clipboard.writeText(text);return true}catch{}}const area=el('textarea');area.value=text;area.style.cssText='position:fixed;left:-9999px';document.body.append(area);area.select();let ok=false;try{ok=document.execCommand('copy')}catch{}area.remove();return ok}
$('note-form').addEventListener('submit',e=>{e.preventDefault();if(currentUser!==ALLOWED_USER||!active)return;
 const name=$('client').value.replace(/\s+/g,' ').trim(),amount=parseAmount($('amount').value);
 if(!name||name.length>80){toast('Escribe el nombre del cliente.',true);return}if(amount===null){toast('Ingresa un monto válido.',true);return}
 const prev=manual.find(x=>nameKey(x.name)===nameKey(name));let ok=false;
 if(prev){if(prev.amount+amount>999999999){toast('Total excede el máximo permitido.',true);return}
  const parts=Array.isArray(prev.parts)&&prev.parts.length?prev.parts:[prev.amount];ok=persistManual(manual.map(x=>x.id===prev.id?{...x,amount:x.amount+amount,parts:[...parts,amount]}:x));
 }else{if(manual.length>=1500){toast('Lista manual llena; exporta y limpia primero.',true);return}
   const id=crypto.randomUUID?.()||String(Date.now())+Math.random();ok=persistManual([...manual,{id,name,amount,date:dateISO()}]);}
 if(ok){$('client').value='';$('amount').value='';$('client').focus();toast('Transferencia anotada ✓')}
});
$('copy-excel').addEventListener('click',async()=>{const rows=bankRows();if(!rows.length)return;toast(await copy(excel())?'Copiados '+rows.length+' cliente(s): Nombre · Monto · no':'No se pudo copiar para Excel.',false)});
$('send-wa').addEventListener('click',()=>{if(!bankRows().length)return;const msg=message(),url='https://wa.me/?text='+encodeURIComponent(msg);if(url.length>6000){copy(msg).then(ok=>toast(ok?'Lista extensa copiada para WhatsApp.':'No se pudo copiar.',!ok))}else window.location.href=url});
$('clear').addEventListener('click',()=>{if(currentUser!==ALLOWED_USER||!manual.length)return;if(confirm('¿Ya traspasaste estas '+manual.length+' transferencias manuales a Excel?')){if(persistManual([]))toast('Lista manual vaciada ✓')}});
$('clear-auto-transfer').addEventListener('click',()=>{const len=bankQueue().length;if(!len)return;
 if(confirm('¿Ya traspasaste estas '+len+' transferencias de Entregas contingentes a Excel? Solo se limpia la lista de cobros; las entregas permanecen en su historial.')){if(persistQueue(queue.filter(x=>x.method!=='transfer')))toast('Transferencias de entregas traspasadas ✓')}
});
$('clear-auto-cash').addEventListener('click',()=>{const len=cashEntries().length;if(!len)return;
 if(confirm('¿Ya registraste estos '+len+' cobros en efectivo? Solo se limpia esta lista; las entregas permanecen en su historial.')){if(persistQueue(queue.filter(x=>x.method!=='cash')))toast('Cobros en efectivo limpiados ✓')}
});
document.addEventListener('gestark:ready',e=>{if(active)return;const username=e.detail?.username;if(!username)return;currentUser=String(username);active=true;
 manual=loadManual();queue=loadQueue();$('manual-panel').hidden=currentUser!==ALLOWED_USER;$('workspace').hidden=false;render();
});
window.addEventListener('storage',e=>{if(!active||![PERSONAL_KEY,QUEUE_KEY].includes(e.key))return;manual=loadManual();queue=loadQueue();render()});
})();
