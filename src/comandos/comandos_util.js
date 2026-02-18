const { Sequelize } = require("sequelize");
const { get_command_by_name } = require("../datamgmt/db_utils");


/**
 * @summary Llamado en la rutina de un comando definido en un servidor.
 * 
 * @description Busca y devuelve la respuesta al comando ejecutado en base de datos.
 * 
 * @param {Sequelize} db           Base de datos del bot.
 * @param {string}    command_name Nombre del comando ejecutado.
 * @param {string[]}  channel_ids  Array que incluye los canales sobre los que buscar el comando. En la práctica,
 * será el canal en el que se ejecutó el comando junto con el canal del bot.
 * 
 * @returns {?string} Texto de respuesta del comando ejecutado. Si el comando no está definido, devuelve null. Si el
 * comando está definido tanto en el canal del usuario como en el del bot, devuelve la respuesta asociada al comando
 * en el canal del usuario.
 */
async function obtener_respuesta_de_comando(db, command_name, channel_ids) {
    const comms = await get_command_by_name(db, command_name, channel_ids);
    if (comms.length === 0) return null;
    if (comms.length === 1) return comms[0].Response;
    if (comms.length === 2) {
        if (comms[0].User === channel_ids[0]) return comms[0].Response;
        else return comms[1].Response;
    }
    if (comms.length > 2) return null;
}

module.exports = { obtener_respuesta_de_comando };