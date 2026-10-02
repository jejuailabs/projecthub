import {z} from 'zod';
export const categories=['REFERENCE','MEETING','IDEA'] as const;
export const materialInput=z.object({title:z.string().trim().min(1).max(200),category:z.enum(categories),body:z.string().max(20000)}).strict();
export const fileInput=z.object({name:z.string().min(1).max(255),type:z.string().max(150),size:z.number().int().min(1).max(20*1024*1024)}).strict();
export type Material={id:string;project_id:string;title:string;category:typeof categories[number];body:string;file_name:string|null;mime_type:string|null;byte_size:number|null;storage_path:string|null;ready:boolean;created_at:string;updated_at:string;version:number;created_by?:string;updated_by?:string;url?:string};
export type Revision={id:string;version:number;title:string;category:string;body:string;occurred_at:string;actor_id?:string};
export function isTextFile(name:string){return /\.(txt|md|csv|log)$/i.test(name);}
export async function readTextFile(file:File){if(file.size>80000)throw new Error('textTooLarge');const text=await file.text();if(text.includes('\0')||[...text].length>20000)throw new Error('invalidText');return text;}
