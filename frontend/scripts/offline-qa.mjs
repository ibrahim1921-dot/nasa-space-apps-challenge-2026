// CDP network fixtures verify the real HTTP client without adding backend code.
import { readFile } from 'node:fs/promises';
const base = 'http://127.0.0.1:3001';
const summary = JSON.parse(await readFile('../docs/samples/summary-response.json','utf8'));
const result = JSON.parse(await readFile('../docs/samples/checkin-response.json','utf8'));
const tabs = await (await fetch('http://127.0.0.1:9223/json/list')).json();
const socket = new WebSocket(tabs.find(tab => tab.type === 'page').webSocketDebuggerUrl);
await new Promise(resolve => socket.addEventListener('open',resolve,{once:true}));
let seq=0; const pending=new Map(); let posts=0;
function call(method,params={}) { return new Promise((resolve,reject)=>{const id=++seq; pending.set(id,{resolve,reject}); socket.send(JSON.stringify({id,method,params}));}); }
function fixture(url) {
  const parsed=new URL(url); const path=parsed.pathname;
  if(path==='/api/crew') return [{id:'crew-01',name:'Alex Morgan',role:'Mission commander'}];
  if(path.endsWith('/summary')) return {...summary,name:'Alex Morgan'};
  if(path.endsWith('/readings')) return {crewId:'crew-01',indicator:parsed.searchParams.get('indicator'),source:'synthetic',readings:[{recordedAt:summary.asOf,value:64,status:'normal'}]};
  if(path==='/api/nights') return {subject:'test-subject',source:'general human data (PhysioNet)',subjects:['test-subject'],nights:[{date:'2026-11-14',status:'normal',anomalyScore:.1,reason:'QA fixture'}]};
  if(path==='/api/labs') return {analyte:'GLUCOSE',source:'NASA',unit:'mg/dL',referenceRange:{low:70,high:100},draws:['L-92','L-44','L-3','R+1','R+45','R+82','R+194'].map(draw=>({draw,crew1:90,crew2:90,crew3:90,crew4:90}))};
  if(path==='/api/environment/radiation') return {source:'environment',days:[{date:'2026-11-14',dailyDose:.2,accumulatedDose:.2}]};
  if(path.endsWith('/checkins')) {posts++; return result;} return {status:'UP'};
}
socket.addEventListener('message',event=>{ const message=JSON.parse(event.data); if(message.id) {const task=pending.get(message.id);pending.delete(message.id);if(message.error)task.reject(new Error(message.error.message));else task.resolve(message.result);} else if(message.method==='Fetch.requestPaused') {const {requestId,request}=message.params; call('Fetch.fulfillRequest',{requestId,responseCode:200,responseHeaders:[{name:'Content-Type',value:'application/json'},{name:'Access-Control-Allow-Origin',value:'*'},{name:'Access-Control-Allow-Methods',value:'GET, POST, OPTIONS'},{name:'Access-Control-Allow-Headers',value:'Content-Type, Idempotency-Key'}],body:Buffer.from(JSON.stringify(request.method==='OPTIONS'?{}:fixture(request.url))).toString('base64')}).catch(console.error);} });
async function evaluate(expression) {const response=await call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(response.exceptionDetails)throw new Error(response.exceptionDetails.exception?.description || 'Browser evaluation failed');return response.result.value;}
async function waitFor(expression) {for(let i=0;i<250;i++){if(await evaluate(expression))return;await new Promise(resolve=>setTimeout(resolve,100));}throw new Error(`Timed out: ${expression}`);}
async function navigate(path,text) {await call('Page.navigate',{url:base+path});await waitFor(`document.body?.innerText.includes(${JSON.stringify(text)})`);}
async function intercept() {await call('Fetch.enable',{patterns:[{urlPattern:'http://localhost:8080/*',requestStage:'Request'}]});}
async function sleepSubject() {await navigate('/sleep','Subject ID');await evaluate(`(() => {const input=document.querySelector('input[list]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'test-subject');input.dispatchEvent(new Event('input',{bubbles:true}));})()`);await evaluate(`document.querySelector('button[type=submit]').click()`);await waitFor(`document.body.innerText.includes('QA fixture')`);}
await call('Page.enable');await call('Runtime.enable');
try {
  await call('Page.navigate',{url:base});
  await waitFor(`location.origin === '${base}' && document.readyState === 'complete'`);
  await evaluate(`localStorage.clear()`);
  await navigate('/','Select your crew profile');await waitFor(`document.body.innerText.includes('No saved results')`);
  if(await evaluate(`document.body.innerText.includes('Demo data')`)) throw new Error('Real mode showed the Demo data tag');
  console.log('PASS real mode, backend absent, cold cache shows unavailable state');
  await intercept();await navigate('/','Alex Morgan');await evaluate(`document.querySelector('.crew-card').click()`);await waitFor(`document.body.innerText.includes('Body systems')`);
  await navigate('/trends','Your usual range is not supplied');await sleepSubject();await navigate('/labs','General lab reference ranges');await waitFor(`document.querySelector('.recharts-surface') !== null`);await navigate('/environment','Daily dose');await waitFor(`document.querySelector('.recharts-surface') !== null`);
  await call('Fetch.disable');
  for(const [path,text] of [['/dashboard','Body systems'],['/trends','Your patterns, over time.'],['/labs','General lab reference ranges'],['/environment','Daily dose']]) {await navigate(path,text);await waitFor(`document.body.innerText.includes('Showing your last saved results')`);console.log(`PASS real API cached offline ${path}`);}
  await sleepSubject();await waitFor(`document.body.innerText.includes('Showing your last saved results')`);console.log('PASS real API cached offline /sleep');
  await navigate('/','Select your crew profile');await waitFor(`document.body.innerText.includes('Showing your last saved results')`);console.log('PASS real API cached offline /');
  await navigate('/checkin','How to measure');
  for(const [step,values] of [['64'],['118','76'],['92'],['36.8'],['7.2']].entries()) {await evaluate(`(() => {const fields=document.querySelectorAll('input[type=number]');${JSON.stringify(values)}.forEach((value,i)=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(fields[i],value);fields[i].dispatchEvent(new Event('input',{bubbles:true}));});})()`);await evaluate(`document.querySelector('button[type=submit]').click()`);await waitFor(`document.getElementById('checkin-progress')?.textContent.includes('Step ${step+2}')`);}
  await evaluate(`document.querySelector('.mood-buttons button:nth-child(4)').click()`);await evaluate(`document.querySelector('button[type=submit]').click()`);await waitFor(`document.body.innerText.includes('Waiting to send')`);
  if(!(await evaluate(`JSON.parse(localStorage.getItem('chm:pending:real')).length === 1`)))throw new Error('Offline check-in was not persisted');
  await intercept();await evaluate(`window.dispatchEvent(new Event('online'))`);await waitFor(`JSON.parse(localStorage.getItem('chm:pending:real')).length === 0`);
  if(posts!==1)throw new Error(`Expected one queued POST, got ${posts}`);console.log('PASS offline check-in persisted and automatically sent once after reconnection');
} finally {await call('Fetch.disable');socket.close();}
