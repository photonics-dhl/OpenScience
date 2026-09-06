import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }) }));
import { ApiClientError } from '../lib/api';
import { LoginForm, classifyLoginError } from '../components/auth/LoginForm';
it.each([
 ['ACCOUNT_NOT_ACTIVE',403,'inactive'], ['CREDENTIALS_INVALID',401,'credentials'],
 ['RATE_LIMITED',429,'rate'], ['INTERNAL_ERROR',503,'unavailable'],
 ['LOGIN_INTERNAL_ERROR',503,'unavailable'], ['PASSWORD_POLICY',403,'generic'], ['FORBIDDEN',403,'generic'],
])('classifies %s (%i) without confusing server faults with bad credentials',(code,status,expected)=>{
 expect(classifyLoginError(new ApiClientError(code,'raw backend details',Number(status)))).toBe(expected);
});
it('keeps unexpected errors generic',()=>expect(classifyLoginError(new Error('sensitive detail'))).toBe('generic'));
it('provides touch-accessible password visibility and collapsed recovery without submitting',()=>{
 const html=renderToStaticMarkup(createElement(LoginForm));
 expect(html).toContain('type="password"'); expect(html).toContain('aria-pressed="false"');
 expect(html).toContain('aria-label="login.showPassword"'); expect(html).toContain('aria-expanded="false"');
 expect(html).toContain('min-h-11'); expect(html).toContain('login.forgotPassword');
 expect(html).not.toContain('login.recoveryBody');
});
it('places all recovery and failure messages in auth.login in both locales',async()=>{
 for(const locale of ['en','zh']){
  const {default:messages}=await import(`../messages/${locale}.json`);
  for(const key of ['showPassword','hidePassword','forgotPassword','recoveryTitle','recoveryBody']){
   expect(messages.auth.login[key]).toBeTruthy(); expect(messages.auth.register[key]).toBeUndefined();
  }
  for(const key of ['credentials','inactive','rate','unavailable','generic'])expect(messages.auth.login.failure[key]).toBeTruthy();
 }
});
