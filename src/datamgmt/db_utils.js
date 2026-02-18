const { Sequelize, Model } = require('sequelize');


/**
 * @summary Llamado en la inicialización del bot para obtener los canales en los que debe entrar.
 * 
 * @description Devuelve los datos de todos los canales registrados en base de datos.
 * 
 * @param {Sequelize} sequelize Base de datos del bot.
 * 
 * @returns {Model[]} Array que contiene la información de los canales registrados.
 */
async function get_bot_users(sequelize) {
    const channels = sequelize.models.Channels;
    try {
        return await sequelize.transaction(async (t) => {
            return await channels.findAll({
                transaction: t,
            });
        });
    }
    catch (error) {
        console.error(error['message']);
    }
}


/**
 * @summary Llamado al añadir un nuevo usuario del bot (comando !hola).
 * 
 * @description Registra un canal de Twitch para que el bot empiece a escuchar en su chat.
 * 
 * @param {Sequelize} sequelize Base de datos del bot.
 * @param {string}    user_id   ID de Twitch asociado al usuario añadido.
 * @param {string}    user_name Canal de Twitch del usuario añadido.
 * 
 * @returns {[Model, null]} Array cuyo primer elemento es el modelo correspondiente al usuario añadido.
 */
async function insert_bot_user(sequelize, user_id, user_name) {
    const channels = sequelize.models.Channels;
    try {
        return await sequelize.transaction(async (t) => {
            return await channels.upsert({
                UserId: user_id,
                Name: user_name,
            }, {
                transaction: t,
            });
        });
    }
    catch (error) {
        console.error(error['message']);
    }
}


/**
 * @summary Llamado al eliminar un usuario del bot (comando !adios).
 * 
 * @description Elimina un canal de Twitch del registro y hace que el bot deje de escuchar en su chat.
 * 
 * @param {Sequelize} sequelize Base de datos del bot.
 * @param {string}    user_id   ID de Twitch asociado al usuario a eliminar.
 * 
 * @returns {number} Número de entradas de base de datos eliminadas.
 */
async function remove_bot_user(sequelize, user_id) {
    const channels = sequelize.models.Channels;
    try {
        return await sequelize.transaction(async (t) => {
            return await channels.destroy(
                {
                    where: {
                        UserId: user_id,
                    }
                },
                {
                    transaction: t,
                });
        });
    }
    catch (error) {
        console.error(error['message']);
    }
}


/**
 * @summary Llamado como parte de la rutina del comando !comando.
 * 
 * @description Añade un nuevo comando de texto, o edita uno existente.
 * 
 * @param {Sequelize} sequelize    Base de datos del bot.
 * @param {string}    command_name Nombre del comando.
 * @param {string}    user_id      ID del usuario correspondiente al canal donde se crea el comando.
 * @param {string}    command_text Respuesta asociada al comando.
 * 
 * @returns {[Model, null]} Array cuyo primer elemento es el modelo correspondiente al comando creado o editado.
 */
async function add_or_edit_command(sequelize, command_name, user_id, command_text) {
    const commands = sequelize.models.Commands;
    try {
        return await sequelize.transaction(async (t) => {
            return await commands.upsert({
                Name: command_name,
                User: user_id,
                Response: command_text,
            }, {
                transaction: t,
            });
        });
    }
    catch (error) {
        console.error(error['message']);
    }
}


/**
 * @summary Llamado como parte de la rutina del comando !borracomando.
 * 
 * @summary Elimina un comando de texto.
 * 
 * @param {Sequelize} sequelize    Base de datos del bot.
 * @param {string}    command_name Nombre del comando a borrar.
 * @param {string}    user_id      ID del usuario correspondiente al canal donde se borra el comando.
 * 
 * @returns {number} Número de entradas de base de datos eliminadas.
 */
async function delete_command(sequelize, command_name, user_id) {
    const commands = sequelize.models.Commands;
    try {
        return await sequelize.transaction(async (t) => {
            return await commands.destroy(
                {
                    where: {
                        Name: command_name,
                        User: user_id,
                    }
                },
                {
                    transaction: t,
                });
        });
    }
    catch (error) {
        console.error(error['message']);
    }
}


/**
 * @summary Llamado como parte de la rutina del comando !comandos.
 * 
 * @description Devuelve una lista de comandos definidos en los canales pasados como parámetro.
 * 
 * @param {Sequelize} sequelize   Base de datos del bot.
 * @param {string[]}  channel_ids IDs de los canales sobre los que obtener los comandos asociados.
 * 
 * @returns {Model[]} Array con los modelos correspondientes a los comandos buscados.
 */
async function get_commands_for_channels(sequelize, channel_ids) {
    const commands = sequelize.models.Commands;
    try {
        return await sequelize.transaction(async (t) => {
            return await commands.findAll({
                where: {
                    User: channel_ids,
                },
                transaction: t,
            });
        });
    }
    catch (error) {
        console.error(error['message']);
    }
}


/**
 * @summary Llamado como parte de la rutina de la llamada a un comando definido en un canal.
 * 
 * @description Devuelve los comandos que se corresponden con el nombre y los canales buscados. En la práctica,
 * puede devolver hasta dos resultados: un comando definido en el propio canal y otro definido en el canal del bot.
 * 
 * @param {Sequelize} sequelize    Base de datos del bot.
 * @param {string}    command_name Nombre del comando a buscar.
 * @param {string[]}  channel_ids  IDs de los canales en los que buscar el comando.
 * 
 * @returns {Model[]} Array con los modelos correspondientes a los comandos buscados.
 */
async function get_command_by_name(sequelize, command_name, channel_ids) {
    const commands = sequelize.models.Commands;
    try {
        return await sequelize.transaction(async (t) => {
            return await commands.findAll({
                where: {
                    Name: command_name,
                    User: channel_ids,
                },
                transaction: t,
            });
        });
    }
    catch (error) {
        console.error(error['message']);
    }
}

module.exports = {
    get_bot_users, insert_bot_user, remove_bot_user, add_or_edit_command, delete_command,
    get_commands_for_channels, get_command_by_name
};