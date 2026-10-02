import {createCipheriv,createDecipheriv,randomBytes} from 'node:crypto';

function key(){
 const value=process.env.TOKEN_ENCRYPTION_KEY??'';
 if(!/^[a-f0-9]{64}$/i.test(value))throw new Error('encryptionUnavailable');
 return Buffer.from(value,'hex');
}
export function seal(value:unknown,context:string){
 const iv=randomBytes(12);const cipher=createCipheriv('aes-256-gcm',key(),iv);
 cipher.setAAD(Buffer.from(context));
 const data=Buffer.concat([cipher.update(JSON.stringify(value),'utf8'),cipher.final()]);
 return [process.env.TOKEN_KEY_VERSION??'1',iv.toString('base64url'),cipher.getAuthTag().toString('base64url'),data.toString('base64url')].join('.');
}
export function unseal<T>(value:string,context:string):T{
 const [version,iv,tag,data]=value.split('.');
 if(version!==(process.env.TOKEN_KEY_VERSION??'1'))throw new Error('encryptionUnavailable');
 const cipher=createDecipheriv('aes-256-gcm',key(),Buffer.from(iv,'base64url'));
 cipher.setAAD(Buffer.from(context));cipher.setAuthTag(Buffer.from(tag,'base64url'));
 return JSON.parse(Buffer.concat([cipher.update(Buffer.from(data,'base64url')),cipher.final()]).toString('utf8'));
}
