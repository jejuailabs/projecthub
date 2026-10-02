import {afterEach,describe,it,expect,vi} from 'vitest';
vi.mock('server-only',()=>({}));
vi.mock('@/lib/session',()=>({session:vi.fn()}));
import {ticket,verifyTicket,credentialContext} from './server';
import {adapters,authorizationUrl} from './providers';
import type {Connection,ExternalItem} from './domain';
const connection:Connection={id:'c',workspace_id:'w',owner_user_id:'u',provider:'GITHUB',account_id:'a',scope_id:'',label:'Personal',account_label:'A',scope_label:'App',version:1,connected_at:'',disconnected_at:null};
const item:ExternalItem={external_id:'42',kind:'repository',scope:'1',name:'Repo',url:'https://github.com/a/repo',description:'',metadata:{}};
afterEach(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals();vi.useRealTimers();});
describe('integration boundary',()=>{
 it('binds selection tickets to owner/workspace/connection/version and expiry',()=>{
  vi.stubEnv('TOKEN_ENCRYPTION_KEY','ab'.repeat(32));vi.useFakeTimers();const value=ticket(connection,item);expect(verifyTicket(connection,value)).toEqual(item);
  for(const patch of [{owner_user_id:'other'},{workspace_id:'other'},{id:'other'},{version:2}])expect(()=>verifyTicket({...connection,...patch},value)).toThrow('selectionExpired');
  expect(()=>verifyTicket(connection,value+'x')).toThrow();vi.advanceTimersByTime(16*60*1000);expect(()=>verifyTicket(connection,value)).toThrow('selectionExpired');
 });
 it('cannot swap credentials between external accounts',()=>{expect(credentialContext(connection)).not.toBe(credentialContext({...connection,account_id:'other'}));});
 it('requests GitHub App authorization with PKCE and no broad repo scope',()=>{
  vi.stubEnv('GITHUB_CLIENT_ID','public-client');vi.stubEnv('GITHUB_CLIENT_SECRET','secret');const u=new URL(authorizationUrl('GITHUB','https://hub.example/callback','state','challenge'));expect(u.searchParams.get('code_challenge_method')).toBe('S256');expect(u.searchParams.has('scope')).toBe(false);expect(u.href).not.toContain('secret');expect(u.searchParams.get('prompt')).toBe('select_account');
 });
 it('keeps GitHub pagination inside the selected installation',async()=>{
  const mock=vi.fn().mockResolvedValue(new Response(JSON.stringify({repositories:Array.from({length:50},(_,i)=>({id:i+1,name:'repo',html_url:'https://github.com/a/repo'}))})));vi.stubGlobal('fetch',mock);const result=await adapters.GITHUB.list({access_token:'secret',scope:''},'123','2','');expect(mock.mock.calls[0][0]).toBe('https://api.github.com/user/installations/123/repositories?per_page=50&page=2');expect(result.cursor).toBe('3');expect(JSON.stringify(result)).not.toContain('secret');
 });
 it('uses the authenticated Vercel team, never an arbitrary requested scope',async()=>{
  const mock=vi.fn().mockResolvedValue(new Response(JSON.stringify({projects:[],pagination:{next:123}})));vi.stubGlobal('fetch',mock);const result=await adapters.VERCEL.list({access_token:'secret',scope:'team-real'},'team-fake','','');expect(mock.mock.calls[0][0]).toContain('teamId=team-real');expect(result.cursor).toBe('123');
 });
 it('returns a reconnect error without exposing provider response bodies',async()=>{vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response('PRIVATE provider details',{status:401})));await expect(adapters.GITHUB.scopes({access_token:'secret',scope:''})).rejects.toThrow('reconnectRequired');});
 it('refuses expired access tokens before contacting a provider',async()=>{const mock=vi.fn();vi.stubGlobal('fetch',mock);await expect(adapters.GITHUB.scopes({access_token:'secret',scope:'',expires_at:1})).rejects.toThrow('reconnectRequired');expect(mock).not.toHaveBeenCalled();});
});
