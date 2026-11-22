from pathlib import Path
from playwright.sync_api import sync_playwright
from bs4 import BeautifulSoup
D=Path(__file__).parent
CSS=(D/'gestark-ui.css').read_text()
UPD=(D/'gestark-updates.js').read_text()
CLIENT=(D/'entregas-clientes.js').read_text()
CORE=(D/'laboratorio-core.js').read_text()

def html(name):
 s=BeautifulSoup((D/name).read_text(),'html.parser')
 for t in s.find_all('script'):t.decompose()
 tag=s.new_tag('style');tag.string=CSS;s.head.append(tag)
 return str(s)

def up(page, which):
 page.evaluate("document.documentElement.classList.add('gestark-unlocked')")
 page.evaluate(UPD)
 page.evaluate('(page)=>document.documentElement.dataset.gestarkPage=page',which)
 page.wait_for_function("getComputedStyle(document.querySelector('.gestark-nav-modern')).display==='grid'")
 nav=page.locator('.gestark-nav-modern')
 assert nav.locator('a').count()==5
 assert nav.locator('a').all_text_contents()==['Inicio','Checklist','Clientes','Transferencias','Enlaces']
 assert nav.locator('.gestark-nav-action').get_attribute('href')=='./entregas-clientes.html'
 assert page.locator('#gestark-update').count()==1
 center=page.locator('.gestark-nav-action-icon').bounding_box()
 assert center, 'centre button hidden'
 assert abs(center['x']+center['width']/2-375/2)<5,center
 assert center['width']>=51 and center['height']>=51
 btn=page.locator('#gestark-update').bounding_box();assert btn['width']>=40 and btn['height']>=40
 assert page.evaluate('document.documentElement.scrollWidth <= innerWidth + 2')

with sync_playwright() as p:
 browser=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox'])
 page=browser.new_page(viewport={'width':375,'height':812},device_scale_factor=2)
 errors=[];page.on('pageerror',lambda error:errors.append(str(error)))
 page.set_content(html('index.html'));up(page,'index')
 assert page.locator('.tool').count()>2
 page.screenshot(path=str(D/'vista_previa_inicio_v28.png'),full_page=False)
 print('HOME OK')
 page.set_content(html('entregas-clientes.html'))
 page.evaluate('''() => {
 window.__storageMap=new Map();window.__shared=[];
 Object.defineProperty(window,'localStorage',{configurable:true,value:{getItem(k){return window.__storageMap.get(k)||null},setItem(k,v){window.__storageMap.set(k,String(v))},removeItem(k){window.__storageMap.delete(k)}}});
 Object.defineProperty(navigator,'mediaDevices',{configurable:true,value:{getUserMedia:async()=>({})}});
 Object.defineProperty(navigator,'vibrate',{configurable:true,value:()=>true});
 Object.defineProperty(navigator,'canShare',{configurable:true,value:()=>true});
 Object.defineProperty(navigator,'share',{configurable:true,value:async payload=>{window.__shared.push({text:payload.text,count:payload.files?.length||0})}});
 window.Html5QrcodeSupportedFormats={CODE_128:1,CODE_39:2,ITF:3};
 window.Html5Qrcode=class {async start(_,__,cb){window.__camera_cb=cb;document.getElementById('camera').appendChild(document.createElement('video'))}async stop(){} async clear(){document.getElementById('camera').replaceChildren()}getRunningTrackCapabilities(){return {torch:false}}};
 Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async t=>window.__copied=t}});
 }''')
 page.evaluate(CORE);page.evaluate(CLIENT)
 page.evaluate("document.dispatchEvent(new CustomEvent('gestark:ready',{detail:{username:'CIBC',name:'Operador Prueba'}}))")
 up(page,'entregas-clientes')
 assert page.locator('#workspace').is_visible()
 page.evaluate('''() => {const a=[
 {id:'roster-new',client:'Comercial Los Andes',at:new Date('2026-11-21T13:45:00-03:00').getTime(),orders:[{of:'282562685',at:Date.now()},{of:'282562686',at:Date.now()}]},
 {id:'roster-old',client:'Comercial Antiguo',at:new Date('2026-11-19T15:00:00-03:00').getTime(),orders:[{of:'282562687',at:Date.now()}]}];
 localStorage.setItem('gestark:clients:rosters:v1',JSON.stringify(a));}''')
 page.locator('#tab-history').click()
 assert page.locator('.history-row').count()==3
 assert page.locator('.history-state').all_text_contents()==['Pendiente']*3
 assert page.locator('#history-state-filter option').all_text_contents()==['Todos','Pendientes','Cerradas']
 assert page.locator('#history-pending-count').inner_text()=='3'
 assert page.locator('#history-closed-count').inner_text()=='0'
 page.locator('.history-row').filter(has_text='282562685').locator('.history-state').click()
 assert page.locator('#history-pending-count').inner_text()=='2'
 assert page.locator('#history-closed-count').inner_text()=='1'
 assert page.locator('.history-row').last.locator('.history-of').inner_text()=='282562685'
 assert page.locator('.history-row').last.locator('.history-state').inner_text()=='✓ Cerrada'
 page.locator('#history-state-filter').select_option('pending');assert page.locator('.history-row').count()==2
 page.locator('#history-state-filter').select_option('closed');assert page.locator('.history-row').count()==1
 page.locator('#history-date-filter').select_option('20261119');assert page.locator('.history-row').count()==0
 page.locator('#history-state-filter').select_option('all');assert page.locator('.history-row').count()==1
 page.locator('#history-date-filter').select_option('all')
 page.wait_for_timeout(2700)
 page.screenshot(path=str(D/'vista_previa_nomina_v28.png'),full_page=False)
 assert page.evaluate('document.documentElement.scrollWidth <= innerWidth + 2')
 page.locator('.history-row').filter(has_text='282562685').locator('.history-state').click()
 assert page.locator('#history-closed-count').inner_text()=='0'
 assert 'roster-new:282562685' not in page.evaluate("JSON.parse(localStorage.getItem('gestark:clients:system-closure:v1'))")
 page.locator('#tab-scan').click()
 page.locator('#client').fill('Cliente prueba')
 page.locator('#manual-order').fill('282562705');page.locator('#manual-form button').click()
 assert page.locator('#order-count').inner_text()=='1'
 page.screenshot(path=str(D/'vista_previa_escaneo_v28.png'),full_page=False)
 page.locator('#finish').click()
 page.wait_for_timeout(250)
 assert page.evaluate('window.__shared.length')==1, 'Compartir nativo simulado debe recibir un archivo'
 assert page.locator('#share-dialog').is_hidden()
 page.locator('#tab-history').click()
 assert page.locator('.history-row').count()==4
 assert not errors,errors
 print('PASS: centered nav, update button, no mobile overflow, shared colors, dates, closure filter, persistence, manual scan and share')
 browser.close()
