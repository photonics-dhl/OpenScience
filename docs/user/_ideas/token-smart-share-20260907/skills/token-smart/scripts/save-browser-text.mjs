// Preserve structured text returned by the supported browser tool without retyping.
import {readFileSync, writeFileSync} from 'node:fs';
const [session, destination, field='code']=process.argv.slice(2);
if(!session||!destination)throw Error('Usage: node save-browser-text.mjs OWN_SESSION.jsonl NEW_FILE [field=code]');
let found;
for(const line of readFileSync(session,'utf8').split('\n')){
 if(!line.trim())continue;
 let row;try{row=JSON.parse(line);}catch{continue;}
 if(row.type!=='response_item'||row.payload?.type!=='function_call_output')continue;
 const output=row.payload.output;
 const blocks=typeof output==='string'?[{text:output}]:Array.isArray(output)?output:[];
 for(const block of blocks){
  let value;try{value=JSON.parse(block.text);}catch{continue;}
  if(value&&Object.hasOwn(value,field)&&typeof value[field]==='string'&&value[field].trim())found=value[field];
 }
}
if(found===undefined)throw Error(`No structured browser output with nonempty ${field}; do not reconstruct missing content.`);
writeFileSync(destination,found,{encoding:'utf8',flag:'wx'});
console.log(JSON.stringify({saved:destination,bytes:Buffer.byteLength(found),field}));
