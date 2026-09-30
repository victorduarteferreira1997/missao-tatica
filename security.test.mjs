import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const app = await readFile(new URL('./app.html', import.meta.url), 'utf8');

assert.match(app, /firebasejs\/11\.6\.1\/firebase-app-check\.js/, 'O módulo do App Check deve usar a mesma versão do Firebase.');
assert.match(app, /new ReCaptchaEnterpriseProvider\('6Lf1edctAAAAAESE5LJWvWMvJ5p2082iAUDQ0-yN'\)/, 'O App Check deve usar a chave de site registrada.');
assert.match(app, /isTokenAutoRefreshEnabled:\s*true/, 'A renovação automática do token do App Check deve permanecer ativa.');
const appCheckInitialization = app.indexOf('initializeAppCheck(app, {');
const authInitialization = app.indexOf('const auth = getAuth(app)');
const firestoreInitialization = app.indexOf('const db = getFirestore(app)');
assert.ok(appCheckInitialization >= 0, 'O App Check deve ser inicializado.');
assert.ok(appCheckInitialization < authInitialization, 'O App Check deve iniciar antes do Authentication.');
assert.ok(appCheckInitialization < firestoreInitialization, 'O App Check deve iniciar antes do Firestore.');

const ownerGuard = app.indexOf('if (!isAuthorizedAppOwner(user))');
const interfaceReveal = app.indexOf("wrapper.style.display = 'block'");
assert.ok(ownerGuard >= 0, 'A validação do proprietário deve existir.');
assert.ok(interfaceReveal >= 0 && ownerGuard < interfaceReveal, 'O proprietário deve ser validado antes de a interface aparecer.');
assert.match(app, /await signOut\(auth\)/, 'Contas não autorizadas devem ser desconectadas.');

const toastStart = app.indexOf('window.showToast = function');
const toastEnd = app.indexOf('window.playMissionCompleteSound', toastStart);
const toastSource = app.slice(toastStart, toastEnd);
assert.match(toastSource, /data-toast-title[^]*\.textContent = String\(title/, 'O título da notificação deve usar textContent.');
assert.match(toastSource, /data-toast-desc[^]*\.textContent = String\(desc/, 'A descrição da notificação deve usar textContent.');
assert.doesNotMatch(toastSource, /innerHTML\s*=\s*`[^`]*\$\{(?:title|desc|iconName|colorClass)\}/, 'Dados dinâmicos não podem entrar no innerHTML da notificação.');

assert.match(app, /window\.escapeHtml\(uiState\.confirm\.message\)/, 'Confirmações devem escapar conteúdo dinâmico.');
assert.match(app, /window\.escapeHtml\(uiState\.alert\.message\)/, 'Alertas devem escapar conteúdo dinâmico.');

console.log('Segurança: App Check, proprietário, notificações, alertas e confirmações conferidos.');
