import assert from 'node:assert/strict';
import test from 'node:test';
import {pendingOF,validEndpoint,modeFromEvent,fromFirestore,localTime} from './gestark-send-push.mjs';

test('no enviar si no hay O.F. pendientes',()=>{
 assert.equal(pendingOF([]),0);
 assert.equal(pendingOF([{orders:[{of:'123456789'}],deleted:true}]),0);
 assert.equal(pendingOF([{orders:[{of:'123456789'}],closures:{'123456789':true}}]),0);
});
test('contabiliza exclusivamente O.F. válidas y pendientes',()=>{
 assert.equal(pendingOF([{orders:[{of:'123456789'},{of:'987654321'},{of:'no'}],closures:{'123456789':true}}]),1);
});
test('slots lunes a viernes en horario Santiago',()=>{
 for(const cron of ['0 10 * * 1-5','30 12 * * 1-5','30 13 * * 1-5','0 17 * * 1-5'])assert.ok(modeFromEvent({GESTARK_PUSH_CRON:cron}));
 assert.equal(modeFromEvent({GESTARK_PUSH_CRON:'0 0 * * *'}),null);
 assert.equal(modeFromEvent({GESTARK_PUSH_MODE:'prueba'}),'prueba');
 const summer=localTime(new Date('2027-01-04T13:00:00Z'));
 const winter=localTime(new Date('2027-07-05T14:00:00Z'));
 assert.equal(summer.hour,10);assert.equal(winter.hour,10);
});
test('convertir documentos de Firestore a datos de aplicación',()=>{
 assert.deepEqual(fromFirestore({mapValue:{fields:{active:{booleanValue:true},orders:{arrayValue:{values:[{stringValue:'A'}]}}}}}),{active:true,orders:['A']});
});
test('filtrar dominios de suscripción para proteger el ejecutor',()=>{
 assert.equal(validEndpoint('https://web.push.apple.com/x'),true);
 assert.equal(validEndpoint('https://fcm.googleapis.com/fcm/send/x'),true);
 assert.equal(validEndpoint('https://updates.push.services.mozilla.com/x'),true);
 assert.equal(validEndpoint('http://localhost/admin'),false);
 assert.equal(validEndpoint('https://169.254.169.254/latest'),false);
 assert.equal(validEndpoint('https://web.push.apple.com.evil.test/x'),false);
});
