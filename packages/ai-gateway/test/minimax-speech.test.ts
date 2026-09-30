import {describe,it,expect,vi} from 'vitest';
import {MiniMaxSpeechClient,validateMiniMaxSpeechRequest} from '../src/minimax-speech';
const input={text:'科学模型的结果。',voiceId:'Chinese (Mandarin)_IntellectualGirl'};
const bytes=Buffer.concat([Buffer.from('ID3'),Buffer.alloc(100)]);
const response=()=>Response.json({base_resp:{status_code:0},data:{status:2,audio:bytes.toString('hex'),subtitle_file:'https://cdn.example.org/subtitles.json'},extra_info:{audio_sample_rate:32000,audio_size:bytes.length,usage_characters:9,audio_length:2300},trace_id:'test-1'});
describe('dedicated speech gateway',()=>{
  it('sends one fixed mainland request and retains actual audio and private subtitle reference',async()=>{
    const transport=vi.fn<typeof fetch>().mockResolvedValue(response());
    const client=new MiniMaxSpeechClient({baseUrl:'https://api.minimax.cn',apiKey:'test-key',fetch:transport});
    const result=await client.synthesize(input);
    expect(result.audio).toEqual(bytes);expect(result.metadata.durationMs).toBe(2300);
    expect(result.subtitleUrl).toBe('https://cdn.example.org/subtitles.json');expect(transport).toHaveBeenCalledTimes(1);
    const [url,init]=transport.mock.calls[0];expect(url).toBe('https://api.minimax.cn/v1/t2a_v2');expect(init?.redirect).toBe('error');
    expect(JSON.parse(String(init?.body))).toMatchObject({model:'speech-2.8-hd',stream:false,output_format:'hex',subtitle_enable:true,subtitle_type:'word',voice_setting:{voice_id:input.voiceId},audio_setting:{format:'mp3',sample_rate:32000}});
  });
  it.each([{text:''},{text:'中'.repeat(2001)},{speed:NaN},{speed:3},{voiceId:'../x'},{pitch:1.5},{unknown:true}])('rejects invalid input before transport %j',async change=>{
    const transport=vi.fn<typeof fetch>();const client=new MiniMaxSpeechClient({baseUrl:'https://api.minimax.cn',apiKey:'test-key',fetch:transport});
    await expect(client.synthesize({...input,...change})).rejects.toMatchObject({code:'SPEECH_REQUEST_INVALID'});expect(transport).not.toHaveBeenCalled();
  });
  it.each([{base_resp:{status_code:0},data:{status:2,audio:'zz'.repeat(100)}},{base_resp:{status_code:0},data:{status:1,audio:bytes.toString('hex')}},{base_resp:{status_code:0},data:{status:2,audio:bytes.toString('hex'),subtitle_file:'http://localhost/a'}}])('rejects malformed final data',async value=>{
    const transport=vi.fn<typeof fetch>().mockResolvedValue(Response.json(value));const client=new MiniMaxSpeechClient({baseUrl:'https://api.minimax.cn',apiKey:'test-key',fetch:transport});
    await expect(client.synthesize(input)).rejects.toMatchObject({code:'SPEECH_RESPONSE_INVALID'});expect(transport).toHaveBeenCalledTimes(1);
  });
  it('preserves numeric rejection without provider text or retry',async()=>{
    const transport=vi.fn<typeof fetch>().mockResolvedValue(Response.json({base_resp:{status_code:1008,status_msg:'private response secret'}}));
    const client=new MiniMaxSpeechClient({baseUrl:'https://api.minimax.cn',apiKey:'test-key',fetch:transport});
    const error=await client.synthesize(input).catch(e=>e);expect(error).toMatchObject({outcome:'rejected',providerCode:1008});
    expect(JSON.stringify(error)).not.toContain('private');expect(transport).toHaveBeenCalledTimes(1);
  });
  it('bounds a stalled response body and aborts without retry',async()=>{
    let signal:AbortSignal|null|undefined;
    const transport=vi.fn<typeof fetch>().mockImplementation(async(_url,init)=>{signal=init?.signal;return new Response(new ReadableStream({start(){}}),{headers:{'content-type':'application/json'}});});
    const client=new MiniMaxSpeechClient({baseUrl:'https://api.minimax.cn',apiKey:'test-key',fetch:transport,timeoutMs:10});
    await expect(client.synthesize(input)).rejects.toMatchObject({code:'SPEECH_TIMEOUT'});expect(signal?.aborted).toBe(true);expect(transport).toHaveBeenCalledTimes(1);
  });
  it('rejects an oversized response and alternate origin',async()=>{
    const transport=vi.fn<typeof fetch>().mockResolvedValue(new Response('{}',{headers:{'content-length':String(17*1024*1024),'content-type':'application/json'}}));
    const client=new MiniMaxSpeechClient({baseUrl:'https://api.minimax.cn',apiKey:'test-key',fetch:transport});
    await expect(client.synthesize(input)).rejects.toMatchObject({code:'SPEECH_RESPONSE_TOO_LARGE'});
    expect(()=>new MiniMaxSpeechClient({baseUrl:'https://api.minimax.io',apiKey:'test-key'})).toThrow('SPEECH_CONFIG_INVALID');
    expect(validateMiniMaxSpeechRequest(input).speed).toBe(1);
  });
});
