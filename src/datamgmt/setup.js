const { Sequelize, DataTypes } = require('sequelize');

/**
 * @summary Llamado en la rutina de inicialización del bot.
 *
 * @description Inicializa la base de datos SQLite del bot: incluye todas las definiciones de tablas y la creación
 * del archivo de base de datos si este no existe.
 *
 * @param {boolean} db_logging Establece si se registran todas las operaciones hechas en base de datos a la consola.
 *
 * @returns {Sequelize} Objeto Sequelize correspondiente a la base de datos inicializada del bot.
 */
async function init_db(db_logging) {
    const sequelize = new Sequelize({
        dialect: 'sqlite',
        storage: 'data/churrascobot.db',
        logging: db_logging ? console.log : false,
        define: { freezeTableName: true, timestamps: false },
    });

    const channels = sequelize.define('Channels', {
        UserId: {
            type: DataTypes.TEXT,
            primaryKey: true,
        },
        Name: {
            type: DataTypes.TEXT,
            allowNull: false,
        }
    });

    const commands = sequelize.define('Commands', {
        Id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true,
        },
        Name: {
            type: DataTypes.TEXT,
            unique: 'UniqueKey',
        },
        User: {
            type: DataTypes.TEXT,
            unique: 'UniqueKey',
        },
        Response: {
            type: DataTypes.TEXT,
            allowNull: false,
        }
    });
    commands.belongsTo(channels, { as: 'channel', foreignKey: 'Channel', onDelete: 'NO ACTION' });

    await sequelize.sync();
    return sequelize;
}

module.exports = { init_db };