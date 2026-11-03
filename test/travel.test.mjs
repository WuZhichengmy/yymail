import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { handleTravel } from '../src/travel.mjs';
import { validateWorkspace } from '../public/travel/model.js';

const tokenA='yy_'+'a'.repeat(64), tokenB='yy_'+'b'.repeat(64);
const fixture=()=>({version:1,activeTripId:'trip-1',trips:[{id:'trip-1',name:'杭州慢游',city:'杭州',startDate:'2026-11-10',endDate:'2026-11-12',places:[{id:'spot-1',name:'西湖',type:'spot',day:1,location:[120.15,30.25],poiId:'',address:'杭州',notes:'傍晚散步',checkIn:'',checkOut:''}]}]});
function database(){const sql=new DatabaseSync(':memory:');return {prepare(query){let args=[];const statement={bind(...values){args=values;return statement;},async first(){return sql.prepare(query).get(...args)||null;},async run(){return sql.prepare(query).run(...args);}};return statement;}};}
function request(method='GET',body,token=tokenA,path='workspace',extra={}){return new Request('https://test.example/api/travel/'+path,{method,headers:{Authorization:'Bearer '+token,'Content-Type':'application/json',...extra},...(body?{body:JSON.stringify(body)}:{})});}

test('private cloud workspaces are isolated; stale writes cannot overwrite newer data',async()=>{
 const env={YY_DB:database()};
 let res=await handleTravel(request('GET'),env);assert.deepEqual(await res.json(),{workspace:null,revision:0});
 res=await handleTravel(request('PUT',{workspace:fixture(),revision:0}),env);assert.equal(res.status,200);assert.equal((await res.json()).revision,1);
 res=await handleTravel(request('GET',undefined,tokenB),env);assert.equal((await res.json()).workspace,null);
 const changed=fixture();changed.trips[0].name='新的旅程';
 res=await handleTravel(request('PUT',{workspace:changed,revision:1}),env);assert.equal((await res.json()).revision,2);
 res=await handleTravel(request('PUT',{workspace:fixture(),revision:1}),env);assert.equal(res.status,409);
 res=await handleTravel(request('GET'),env);const restored=await res.json();assert.equal(restored.workspace.trips[0].name,'新的旅程');assert.equal(restored.revision,2);
});
test('missing authentication and cross-site requests are rejected',async()=>{
 assert.equal((await handleTravel(new Request('https://test.example/api/travel/workspace'),{})).status,401);
 assert.equal((await handleTravel(request('GET',undefined,tokenA,'workspace',{Origin:'https://elsewhere.example'}),{})).status,403);
});
test('a nonzero revision cannot silently recreate deleted cloud data',async()=>{
 const response=await handleTravel(request('PUT',{workspace:fixture(),revision:5}),{YY_DB:database()});assert.equal(response.status,409);
});
test('invalid hotel dates, positions and duplicate identifiers do not reach storage',async()=>{
 const env={YY_DB:database()};
 const bad=fixture();bad.trips[0].places[0].location=[181,30];assert.equal((await handleTravel(request('PUT',{workspace:bad,revision:0}),env)).status,400);
 const hotel=fixture();Object.assign(hotel.trips[0].places[0],{type:'hotel',checkIn:'2026-11-12',checkOut:'2026-11-10'});assert.throws(()=>validateWorkspace(hotel),/酒店/);
 const duplicate=fixture();duplicate.trips[0].places.push({...duplicate.trips[0].places[0]});assert.throws(()=>validateWorkspace(duplicate),/重复/);
 const date=fixture();date.trips[0].startDate='2026-02-30';assert.throws(()=>validateWorkspace(date),/日期/);
});
test('oversized uploads are rejected even without trusting Content-Length',async()=>{
 const res=await handleTravel(request('PUT',{padding:'x'.repeat(270000)}),{YY_DB:database()});assert.equal(res.status,413);
});
test('public configuration never returns service or security secrets',async()=>{
 const env={AMAP_JS_KEY:'public-browser-key',AMAP_WEB_KEY:'server-key',AMAP_JS_SECURITY:'private-security',YY_DB:database()};
 const response=await handleTravel(new Request('https://test.example/api/travel/config'),env);const text=await response.text();assert.ok(text.includes('public-browser-key'));assert.ok(!text.includes('server-key'));assert.ok(!text.includes('private-security'));
});
test('map proxy rejects arbitrary proxy paths',async()=>{
 const res=await handleTravel(new Request('https://test.example/_AMapService/https://evil.example'),{AMAP_JS_KEY:'key',AMAP_JS_SECURITY:'secret'});assert.equal(res.status,400);
});
test('unknown API endpoints and missing database return explicit errors',async()=>{
 assert.equal((await handleTravel(request('GET',undefined,tokenA,'unknown'),{})).status,404);
 assert.equal((await handleTravel(request('GET'),{})).status,503);
});

test('room entry resolves a stable shared workspace and rejects unknown room names',async()=>{
 const env={YY_DB:database(),TRAVEL_ROOM_NAME:'test-room'};
 const enter=room=>new Request('https://test.example/api/travel/room',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({room})});
 let response=await handleTravel(enter(' TEST-ROOM '),env);assert.equal(response.status,200);const first=await response.json();assert.equal(first.room,'test-room');assert.match(first.token,/^yy_[a-f0-9]{64}$/);
 response=await handleTravel(enter('test-room'),env);assert.equal((await response.json()).token,first.token);
 response=await handleTravel(request('PUT',{workspace:fixture(),revision:0},first.token),env);assert.equal(response.status,200);
 response=await handleTravel(enter('test-room'),env);const second=await response.json();response=await handleTravel(request('GET',undefined,second.token),env);assert.equal((await response.json()).workspace.trips[0].name,'杭州慢游');
 assert.equal((await handleTravel(enter('not-existing'),env)).status,404);
 assert.equal((await handleTravel(enter('../test'),env)).status,400);
 assert.equal((await handleTravel(new Request('https://test.example/api/travel/room'),env)).status,405);
});
