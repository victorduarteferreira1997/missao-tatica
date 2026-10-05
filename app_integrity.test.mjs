import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';

const app = await readFile(new URL('./app.html', import.meta.url), 'utf8');
const moduleMatch = app.match(/<script\s+type="module">([\s\S]*?)<\/script>/i);

assert.ok(moduleMatch, 'O módulo principal do app deve existir.');

const syntaxCheck = spawnSync(process.execPath, ['--check', '--input-type=module'], {
    input: moduleMatch[1],
    encoding: 'utf8'
});

assert.equal(
    syntaxCheck.status,
    0,
    `O módulo principal precisa compilar antes da publicação.\n${syntaxCheck.stderr}`
);

const inlineHandlers = [...app.matchAll(/on(?:click|change|input|keypress|dragstart|dragend|dragover|dragleave|drop)="window\.([A-Za-z_$][\w$]*)/g)]
    .map(match => match[1]);
const uniqueHandlers = [...new Set(inlineHandlers)].sort();

assert.ok(uniqueHandlers.length > 0, 'A interface deve expor handlers para os controles renderizados.');

const missingHandlers = uniqueHandlers.filter(name => {
    const declaration = new RegExp(`window\\.${name.replace(/[$]/g, '\\$&')}\\s*=`);
    return !declaration.test(app);
});

assert.deepEqual(
    missingHandlers,
    [],
    `Handlers usados na interface sem implementação: ${missingHandlers.join(', ')}`
);

console.log(`Integridade da interface: módulo compilado e ${uniqueHandlers.length} handlers conferidos.`);
