import test from 'node:test';
import assert from 'node:assert/strict';
import {boot} from './test-support/app_boot.mjs';
const key='missao-tatica-auth-redirect-v1';
const error=code=>Object.assign(new Error('SDK detail must stay out of the UI'),{code});
const storage=()=>{const values=new Map([[key,'1']]);return {values,getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)};};
const create=overrides=>boot(null,false,false,overrides);

test('falha do popup aparece na tela de entrada sem depender do app oculto',async()=>{
 const b=create({signInWithPopup:async()=>{throw error('auth/popup-closed-by-user');}});
 await b.window.login();
 assert.match(b.elements['auth-access-message'].textContent,/janela do Google fechou/);
 assert.ok(!b.elements['auth-access-message'].className.includes('hidden'));
 assert.equal(b.ui.alert.show,false);
 assert.notEqual(b.elements['app-wrapper'].style.display,'block');
 await b.c.authCallback(null);
 assert.match(b.elements['auth-access-message'].textContent,/janela do Google fechou/);
});
test('uma tentativa ativa impede outro popup e outro redirecionamento',async()=>{
 let rejectPopup,popups=0,redirects=0;
 const b=create({signInWithPopup:()=>{popups++;return new Promise((_,reject)=>{rejectPopup=reject;});},signInWithRedirect:async()=>{redirects++;}});
 const login=b.window.login();
 assert.equal(b.elements['auth-google-button'].disabled,true);
 assert.equal(b.elements['auth-redirect-button'].disabled,true);
 await b.window.login();await b.window.loginRedirect();
 assert.equal(popups,1);assert.equal(redirects,0);
 rejectPopup(error('auth/popup-blocked'));await login;
 assert.equal(b.elements['auth-google-button'].disabled,false);
 assert.equal(b.elements['auth-redirect-button'].disabled,false);
 assert.match(b.elements['auth-access-message'].textContent,/não abriu a janela/);
});
test('resposta do provedor não libera o app antes da autorização e carga da conta',async()=>{
 const b=create({signInWithPopup:async()=>({user:{uid:'provider-only'}})});
 await b.window.login();
 assert.notEqual(b.elements['app-wrapper'].style.display,'block');
 assert.equal(b.c.firebaseAuth.currentUser,null);
 assert.equal(b.elements['app'].innerHTML,'');
});
test('erro ao iniciar redirecionamento remove marcador e libera nova tentativa',async()=>{
 const session=storage();session.values.clear();
 const b=create({sessionStorage:session,signInWithRedirect:async()=>{assert.ok(session.getItem(key));throw error('auth/network-request-failed');}});
 await b.window.loginRedirect();
 assert.equal(session.getItem(key),null);
 assert.equal(b.elements['auth-google-button'].disabled,false);
 assert.match(b.elements['auth-access-message'].textContent,/Confira a conexão/);
});
test('retorno vazio do redirecionamento informa ausência de sessão uma única vez',async()=>{
 const session=storage();let calls=0;
 const b=create({sessionStorage:session,getRedirectResult:async()=>{calls++;return null;}});
 await b.window.startupForTest.authRedirectReady;
 assert.equal(calls,1);assert.equal(session.getItem(key),null);
 assert.match(b.elements['auth-access-message'].textContent,/não trouxe uma sessão/);
 await b.c.authCallback(null);
 assert.match(b.elements['auth-access-message'].textContent,/não trouxe uma sessão/);
 assert.notEqual(b.elements['app-wrapper'].style.display,'block');
});
test('erro devolvido pelo redirecionamento é visível e não exibe detalhes sensíveis do SDK',async()=>{
 const b=create({sessionStorage:storage(),getRedirectResult:async()=>{throw error('auth/invalid-credential');}});
 await b.window.startupForTest.authRedirectReady;
 assert.match(b.elements['auth-access-message'].textContent,/auth\/invalid-credential/);
 assert.doesNotMatch(b.elements['auth-access-message'].textContent,/SDK detail/);
});
test('abertura comum não tenta concluir um redirecionamento inexistente',async()=>{
 let calls=0;const b=create({getRedirectResult:async()=>{calls++;return null;}});
 await b.window.startupForTest.authRedirectReady;
 assert.equal(calls,0);
 assert.equal(b.elements['auth-access-message'].textContent,undefined);
});
test('armazenamento de sessão indisponível explica alternativa sem iniciar redirecionamento',async()=>{
 let calls=0;const b=create({sessionStorage:{getItem(){throw Error('blocked');},setItem(){throw Error('blocked');}},signInWithRedirect:async()=>{calls++;}});
 await b.window.loginRedirect();
 assert.equal(calls,0);
 assert.match(b.elements['auth-access-message'].textContent,/Tente Entrar com Google/);
 assert.equal(b.elements['auth-google-button'].disabled,false);
});
