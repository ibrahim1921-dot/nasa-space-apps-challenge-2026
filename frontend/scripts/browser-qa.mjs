// Run against an already running app and a temporary Chromium CDP session.
// No browser package or runtime dependency is required (Node 22+).
import { mkdir, writeFile } from 'node:fs/promises';
const base = process.argv[2] || 'http://127.0.0.1:3000';
const tabs = await (await fetch('http://127.0.0.1:9223/json/list')).json();
const socket = new WebSocket(tabs.find(tab => tab.type === 'page').webSocketDebuggerUrl);
await new Promise(resolve => socket.addEventListener('open', resolve, { once: true }));
let seq = 0; const pending = new Map(); const errors = [];
socket.addEventListener('message', event => { const message = JSON.parse(event.data); if (message.id) { const task = pending.get(message.id); pending.delete(message.id); if (message.error) task.reject(new Error(message.error.message)); else task.resolve(message.result); } else if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.text); });
function call(method, params = {}) { return new Promise((resolve,reject) => { const id = ++seq; pending.set(id,{resolve,reject}); socket.send(JSON.stringify({id,method,params})); }); }
async function evaluate(expression) { const result = await call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true}); if(result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text); return result.result.value; }
async function waitFor(expression) { for(let i=0;i<100;i++) { if(await evaluate(expression)) return; await new Promise(resolve=>setTimeout(resolve,100)); } throw new Error(`Timed out: ${expression}`); }
function assert(value, message) { if(!value) throw new Error(message); }
async function navigate(path, text) { await call('Page.navigate',{url:base+path}); await waitFor(`document.body?.innerText.includes(${JSON.stringify(text)})`); await waitFor(`!document.body?.innerText.includes('Preparing your workspace')`); }
async function key(keyName, code = keyName) { const virtual = { Enter:13, Tab:9, Escape:27 }[keyName]; await call('Input.dispatchKeyEvent',{type:'keyDown',key:keyName,code,windowsVirtualKeyCode:virtual,nativeVirtualKeyCode:virtual}); await call('Input.dispatchKeyEvent',{type:'keyUp',key:keyName,code,windowsVirtualKeyCode:virtual,nativeVirtualKeyCode:virtual}); }
await call('Page.enable'); await call('Runtime.enable');
await call('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
try {
  await navigate('/','Select your crew profile'); await waitFor(`document.querySelectorAll('.crew-card').length === 3`);
  await evaluate(`document.querySelector('.crew-card').click()`); await waitFor(`document.body.innerText.includes('Body systems')`);
  await waitFor(`document.querySelectorAll('svg[aria-label="Recent readings sparkline"]').length === 6`);
  await evaluate(`document.querySelector('path[role=button]').focus()`); await key('Enter');
  await waitFor(`document.querySelector('dialog').open`);
  for(let i=0;i<15;i++) { await key('Tab'); assert(await evaluate(`document.querySelector('dialog').contains(document.activeElement)`),'Focus escaped the body map drawer'); }
  await key('Escape'); await waitFor(`!document.querySelector('dialog').open`);
  assert(await evaluate(`document.activeElement.matches('path[role=button]')`),'Drawer did not restore region focus');
  const routes = [['/dashboard','Body systems'],['/checkin','How to measure'],['/trends','Your patterns, over time.'],['/sleep','anomaly score'],['/labs','General lab reference ranges'],['/environment','Daily dose'],['/about','Data sources']];
  for(const [path,text] of routes) { await navigate(path,text); console.log(`PASS desktop ${path}`); }
  await navigate('/checkin','How to measure');
  const readings = [['64'],['118','76'],['92'],['36.8'],['7.2']];
  for(let step=0;step<5;step++) {
    await evaluate(`(() => { const fields = document.querySelectorAll('input[type=number]'); ${JSON.stringify(readings[step])}.forEach((value,i) => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(fields[i],value); fields[i].dispatchEvent(new Event('input',{bubbles:true})); }); })()`);
    await evaluate(`document.querySelector('button[type=submit]').click()`);
    await waitFor(`document.getElementById('checkin-progress')?.textContent.includes('Step ${step+2}')`);
  }
  await evaluate(`document.querySelector('.mood-buttons button:nth-child(4)').click()`); await evaluate(`document.querySelector('button[type=submit]').click()`);
  await waitFor(`document.body.innerText.includes('A moment well spent.')`); assert(await evaluate(`document.querySelectorAll('.result-row').length === 6`),'Missing evaluated results'); console.log('PASS six-step check-in and API results');
  await navigate('/trends','Your patterns, over time.');
  await evaluate(`document.querySelector('.chart-toolbar button').click()`);
  for(const days of [30,7,14]) {
    await evaluate(`(() => { const select=document.querySelector('.chart-toolbar select');Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(select,'${days}');select.dispatchEvent(new Event('change',{bubbles:true})); })()`);
    await waitFor(`document.querySelectorAll('table tbody tr').length === ${days*6}`);
  }
  console.log('PASS 7/14/30-day history and accessible trend tables');
  await evaluate(`(() => {const select=document.querySelector('header select');select.value='mars_base';select.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  await waitFor(`document.body.innerText.includes('Mars is on average 140 million miles away')`);
  await navigate('/dashboard','Body systems');
  assert(await evaluate(`document.querySelector('header select').value === 'mars_base'`),'Mission preference was not persisted');
  await evaluate(`(() => {const select=document.querySelector('header select');select.value='iss';select.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  for(const [index,status] of [[2,'Alert'],[3,'No data']]) {
    await navigate('/','Select your crew profile');await waitFor(`document.querySelectorAll('.crew-card').length === 3`);
    await evaluate(`document.querySelector('.crew-card:nth-child(${index})').click()`);
    await waitFor(`document.body.innerText.includes('Body systems') && document.body.innerText.includes('${status}')`);
  }
  await navigate('/','Select your crew profile');await waitFor(`document.querySelectorAll('.crew-card').length === 3`);await evaluate(`document.querySelector('.crew-card').click()`);await waitFor(`document.body.innerText.includes('Body systems')`);
  console.log('PASS persisted mission preference and all four mock status states');
  await call('Emulation.setDeviceMetricsOverride',{width:360,height:800,deviceScaleFactor:1,mobile:true});
  for(const [path,text] of [['/','Select your crew profile'],...routes]) { await navigate(path,text); assert(await evaluate(`document.documentElement.scrollWidth <= window.innerWidth`),`Horizontal overflow at 360px: ${path}`); console.log(`PASS mobile ${path}`); }
  await navigate('/dashboard','Body systems');
  await mkdir('qa-artifacts',{recursive:true});
  await writeFile('qa-artifacts/dashboard-mobile.png',Buffer.from((await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:true})).data,'base64'));
  await call('Emulation.setDeviceMetricsOverride',{width:1440,height:1100,deviceScaleFactor:1,mobile:false});
  await writeFile('qa-artifacts/dashboard-desktop.png',Buffer.from((await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:true})).data,'base64'));
  assert(!errors.length,`Browser errors: ${errors.join(', ')}`); console.log('PASS no uncaught browser exceptions; keyboard focus containment, Escape and focus restoration');
} finally { socket.close(); }
