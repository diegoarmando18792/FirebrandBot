const process = require('process');

const util = require('util');
const exec = util.promisify(require('child_process').exec);


/**
 * @summary Llamado en la rutina del comando !fernando
 * 
 * @description Genera y devuelve una frase aleatoria mediante el comando de consola "fortune es"
 * 
 * @returns {string} La frase aleatoria generada.
 */
async function get_fernando_quote() {
    const command = process.platform == 'win32' ? 'wsl fortune es' : '/usr/games/fortune es';
    try {
        const output = await exec(command);
        let stdout = output['stdout'];
        stdout = stdout.replaceAll('\n', ' ').replaceAll('\t', ' ');
        return stdout;
    }
    catch (error) {
        console.error(error);
        return "ERROR";
    }
}

module.exports = { get_fernando_quote };