import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const app = await readFile(new URL('./app.html', import.meta.url), 'utf8');

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

console.log('Segurança: proprietário, notificações, alertas e confirmações conferidos.');
