// Public standard-rate estimate, not an account invoice or included-limit meter.
import { readFileSync } from 'node:fs';
const [file, model] = process.argv.slice(2);
const rates = {
  'gpt-6-astra': [250,25,1250],
  'gpt-5.6-sol': [100,10,500],
  'gpt-5.6-terra': [50,5,300],
  'gpt-5.6-luna': [5,0.5,30],
};
if (!file || !rates[model]) throw new Error('Usage: node estimate-credits.mjs USAGE.json MODEL; input JSON has input_tokens, cached_input_tokens, output_tokens.');
const usage=JSON.parse(readFileSync(file,'utf8').replace(/^\uFEFF/,''));
for(const key of ['input_tokens','cached_input_tokens','output_tokens'])
  if(!Number.isSafeInteger(usage[key])||usage[key]<0)throw new Error(`Invalid ${key}`);
if(usage.cached_input_tokens>usage.input_tokens)throw new Error('Cached input exceeds total input');
if(usage.cache_write_input_tokens)throw new Error('Nonzero cache-write usage needs a verified separate rate; not supported.');
const [input,cached,output]=rates[model];
const standardCredits=((usage.input_tokens-usage.cached_input_tokens)*input+usage.cached_input_tokens*cached+usage.output_tokens*output)/1e6;
console.log(JSON.stringify({model,standardCredits,rateDate:'2026-09-07',source:'https://learn.chatgpt.com/docs/pricing',scope:'Token-only standard-rate estimate; excludes speed multipliers and separately billed tools. Not actual charged credits or remaining allowance.'}));
