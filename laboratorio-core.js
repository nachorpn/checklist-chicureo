/* Gestark Laboratorio — reglas comprobables y sin dependencias externas. */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.GestarkLabCore=api;
})(typeof globalThis==='object'?globalThis:this,function(){
 'use strict';
 const onlyDigits=s=>String(s||'').replace(/\D/g,'');
 const sanitizeCode=s=>String(s||'').trim().toUpperCase().replace(/[\s.\-]+/g,'');
 function parseBarcode(raw){
   const original=sanitizeCode(raw);
   if(!original)return {raw:'',of:'',kind:'empty',valid:false,detail:'Código vacío'};
   const digit=onlyDigits(original);
   if(/^\d{9}$/.test(original))return {raw:original,of:original,kind:'of',valid:true,detail:'Código directo de 9 dígitos'};
   // Estructura observada en DOS muestras aportadas por la agencia:
   // prefijo 920, identificadores variables, O.F. de 9 dígitos, bulto de 3, sufijo opcional ENT.
   // Rechazar cadenas desconocidas para no crear OF falsas.
   const match=original.match(/^(920\d{9,})(\d{9})(\d{3})(?:ENT)?$/);
   if(match && original.length>=23){
     return {raw:original,of:match[2],piece:match[3],kind:'extended',valid:true,detail:'Código largo Starken (patrón observado, confirmar)'};
   }
   return {raw:original,of:'',kind:'unrecognized',valid:false,detail:'Formato no confirmado: revisa el número de orden'};
 }
 function validateRut(value){const norm=String(value||'').toUpperCase().replace(/[^0-9K]/g,'');if(!norm)return null;if(!/^\d{7,8}[0-9K]$/.test(norm))return false;const nums=norm.slice(0,-1),dv=norm.slice(-1);let sum=0,factor=2;for(let i=nums.length-1;i>=0;i--){sum+=Number(nums[i])*factor;factor=factor===7?2:factor+1}const mod=11-(sum%11);return (mod===11?'0':mod===10?'K':String(mod))===dv}
 function normalize(s){return String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/[\t\r]+/g,' ').replace(/[|]/g,'I');}
 const clean=v=>String(v||'').replace(/^[\s:.;_-]+/,'').replace(/[\s:;,_-]+$/,'').replace(/\s{2,}/g,' ').trim();
 function findValue(lines,re){
   for(const line of lines){
     const m=line.match(re);
     if(m) {
       const found=clean(m[1]||'');
       if(found)return found;
     }
   }
   return '';
 }
 const pickDigits=(s,n)=>{const digits=onlyDigits(s);return digits.length===n?digits:''};
 function parseText(text){
   const raw=String(text||'');const lines=normalize(raw).split(/\n/).map(x=>x.trim()).filter(Boolean);
   const result={source:/COMPROB\.?\s*BUSQUEDA\s*\/?\s*ENTREGA/.test(normalize(raw))?'comprobante':/STARKEN|BULTOS|POR PAGAR|R13|O\.?F\.?/.test(normalize(raw))?'etiqueta':'indeterminado',
     order:'',name:'',rut:'',retriever:'',rutRetriever:'',address:'',destination:'',origin:'',deliveryType:'',issued:'',delivered:'',time:'',pieces:'',payment:'',amount:'',weight:''};
   // La prioridad es el número impreso junto a Orden Flete/O.F.; jamás adivinarlo por la dirección.
   let order=findValue(lines,/\b(?:ORDEN\s*(?:FLETE|DE\s*FLETE)|O\s*\.?\s*F\s*\.?)\s*[:\-]?\s*([\d.]{8,15})/);
   let of=onlyDigits(order);
   if(of.length===9)result.order=of;
   // Cuando el OCR lee la línea del código largo, aplicar el mismo extractor.
   if(!result.order){
     const candidates=normalize(raw).match(/920[0-9\s.\-]{20,45}(?:ENT)?/g)||[];
     for(const c of candidates){const p=parseBarcode(c);if(p.valid&&p.of){result.order=p.of;break}}
   }
   const fixed=(re,keep=70)=>findValue(lines,re).slice(0,keep);
   const dateExpr='([0-3]?\\d\\s*[\\/\\-.]\\s*[01]?\\d\\s*[\\/\\-.]\\s*20\\d\\d)';
   const dateMatch=(label)=>{for(const s of lines){if(label.test(s)){const m=s.match(new RegExp(dateExpr));if(m)return m[1].replace(/\s+/g,'')}}return ''};
   result.issued=dateMatch(/FECHA\s*EMISI[O0]N/);
   result.delivered=dateMatch(/(?:F\.?\s*ENTREGA|FECHA\s*NORMAL\s*ENTREGA)/);
   result.time=fixed(/\bH\.?\s*ENTREGA\s*[:\-]?\s*([0-2]?\d\s*:\s*[0-5]\d)/,7).replace(/\s+/g,'');
   result.origin=fixed(/\bORIGEN\s*[:\-]\s*(.+)/,50).split(/\s+CTA\.?\s*CTE\.?/)[0].trim();
   result.payment=fixed(/\bTIPO\s*PAGO\s*[:\-]\s*([A-Z]+)/,25);
   result.deliveryType=fixed(/\bTIPO\s*ENTREGA\s*[:\-]\s*([A-Z]+)/,35);
   result.pieces=fixed(/\b(?:ENCARGOS|BULTOS?\s*(?:N[O°º]\.?)*|BULTO\s*(?:N[O°º]\.?)*?)\s*[:\-]?\s*([\d/() ]{1,13})/,15);
   result.weight=fixed(/\bPESO\s*[:\-]\s*([\d.,]+)/,16);
   result.rut=fixed(/\b(?:RUT\s*DESTINATARIO|R\.?U\.?T\.?\s*DESTINATARIO|R\.?U\.?T\.?)\s*[:\-]\s*([\d.\-Kk]{7,15})/,17);
   result.rutRetriever=fixed(/\bRUT\s*RETIRA\s*[:\-]\s*([\d.\-Kk]{7,15})/,17);
   result.name=fixed(/^DESTINATARIO\s*[:\-]\s*([^:]{2,95})/,90);
   result.retriever=fixed(/^RETIRA\s*[:\-]\s*([^:]{2,95})/,90);
   result.address=fixed(/\bDIRECCI[O0]N\s*[:\-]\s*([^:]{4,110})/,105);
   result.destination=fixed(/\bREGI[O0]N\s*Y\s*COMUNA\s*[:\-]?\s*([^:]{3,90})/,80);
   result.amount=fixed(/(?:TOTAL\s*MONTO\s*O\.?F\.?|POR\s*PAGAR)\s*[:\-]?\s*\$?\s*([\d.,]+)/,20);
   // Si OCR dejó nombre y otros campos en la misma línea, cortar los siguientes rótulos.
   for(const key of ['name','retriever','address','destination','origin']){
     result[key]=clean(result[key].split(/\s{2,}|\s+(?=RUT\s|TIPO\s|FECHA\s|TEL\.?|F\.?\s*ENTREGA\s*[:\-]|H\.?\s*ENTREGA\s*[:\-])/)[0]);
   }
   // Evitar que un campo con palabras de otro rótulo se interprete como identidad.
   if(/^(RUT|TIPO|PESO|ORDEN|FECHA|RETIRA|DESTINATARIO)$/.test(result.name))result.name='';
   result.rut=result.rut.toUpperCase();result.rutRetriever=result.rutRetriever.toUpperCase();
   const found=Object.entries(result).filter(([k,v])=>k!=='source'&&v).map(([k])=>k);
   return {fields:result,found,lines:lines.length};
 }
 return {parseBarcode,parseText,onlyDigits,validateRut};
});
