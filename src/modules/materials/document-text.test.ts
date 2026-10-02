import {readFile} from 'node:fs/promises';
import {describe,it,expect,vi} from 'vitest';
vi.mock('server-only',()=>({}));
import {documentText} from './document-text';
import {fileInput,readTextFile} from './domain';
describe('material file boundaries',()=>{
 it.each(['pdf','docx'])('reads actual %s notes',async extension=>{const data=await readFile(new URL(`./fixtures/notes.${extension}`,import.meta.url));expect(await documentText(`notes.${extension}`,data)).toContain('Project Atlas meeting notes');});
 it('rejects files disguised as PDF and unsupported formats',async()=>{await expect(documentText('fake.pdf',Buffer.from('<script>'))).rejects.toThrow('invalidDocument');await expect(documentText('file.exe',Buffer.from('text'))).rejects.toThrow('unsupportedFile');});
 it('enforces upload size and text limits',async()=>{expect(fileInput.safeParse({name:'x.zip',type:'application/zip',size:20971521}).success).toBe(false);await expect(readTextFile(new File(['x'.repeat(20001)],'notes.txt'))).rejects.toThrow();});
});
