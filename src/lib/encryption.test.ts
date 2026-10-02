import {afterEach,expect,it,vi} from 'vitest';
import {seal,unseal} from './encryption';
afterEach(()=>vi.unstubAllEnvs());
it('binds encrypted contents to the user/workspace context',()=>{
 vi.stubEnv('TOKEN_ENCRYPTION_KEY','ab'.repeat(32));
 const value=seal({name:'Private draft'},'workspace:user:draft');
 expect(value).not.toContain('Private draft');expect(unseal(value,'workspace:user:draft')).toEqual({name:'Private draft'});
 expect(()=>unseal(value,'other:user:draft')).toThrow();
});
