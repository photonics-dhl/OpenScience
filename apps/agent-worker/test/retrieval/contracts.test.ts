import { describe, expect, it } from 'vitest';
import { externalHttpUrl } from '../../src/retrieval/contracts';

describe('external retrieval public URLs', () => {
  it('rejects credential-bearing query parameters', () => {
    expect(() => externalHttpUrl('https://publisher.example/paper?X-Amz-Signature=secret')).toThrow('credential');
    expect(() => externalHttpUrl('https://publisher.example/paper?access_token=secret')).toThrow('credential');
  });

  it('rejects bracketed private IPv6 and IPv4-mapped loopback', () => {
    expect(() => externalHttpUrl('https://[::1]/paper')).toThrow('private');
    expect(() => externalHttpUrl('https://[fd00::1]/paper')).toThrow('private');
    expect(() => externalHttpUrl('https://[::ffff:127.0.0.1]/paper')).toThrow('private');
  });
});
