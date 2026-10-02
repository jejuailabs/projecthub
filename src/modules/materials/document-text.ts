import 'server-only';
import {HttpError} from '@/lib/http';
export async function documentText(name:string,buffer:Buffer){
 let text='';
 if(/\.pdf$/i.test(name)){
  if(buffer.subarray(0,5).toString()!=='%PDF-')throw new HttpError(400,'invalidDocument');
  const {getDocument}=await import('pdfjs-dist/legacy/build/pdf.mjs');
  const task=getDocument({data:new Uint8Array(buffer),useSystemFonts:false,disableFontFace:true,stopAtErrors:true});
  try{const pdf=await task.promise;if(pdf.numPages>50)throw new HttpError(413,'tooManyPages');
   for(let i=1;i<=pdf.numPages;i++){const page=await pdf.getPage(i);const content=await page.getTextContent();text+=content.items.map(x=>'str' in x?x.str:'').join(' ')+'\n';if([...text].length>20000)throw new HttpError(413,'tooLarge');}
  }finally{await task.destroy();}
 }else if(/\.docx$/i.test(name)){
  // Check ZIP expansion bounds before allowing the document parser to inflate it.
  let expanded=0;let entries=0;for(let i=0;i+46<=buffer.length;i++){if(buffer.readUInt32LE(i)===0x02014b50){expanded+=buffer.readUInt32LE(i+24);entries++;if(expanded>20*1024*1024||entries>1000)throw new HttpError(413,'tooLarge');i+=45+buffer.readUInt16LE(i+28)+buffer.readUInt16LE(i+30)+buffer.readUInt16LE(i+32);}}
  if(!entries)throw new HttpError(400,'invalidDocument');
  const mammoth=await import('mammoth');text=(await mammoth.extractRawText({buffer})).value;
 }else throw new HttpError(415,'unsupportedFile');
 if(!text.trim())throw new HttpError(422,'noText');if([...text].length>20000)throw new HttpError(413,'tooLarge');return text.trim();
}
