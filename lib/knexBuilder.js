'use strict';

const MigrationAssistant = require('./migrationAssistant');

const internals = {};

module.exports = class KnexBuilder {

    // static getTableCreateAction(tableType, model) {

    //     let createTableAction = `\nknex.schema.createTableIfNotExists('${model.tableName}', function (table) {\n\n`;

    //     if (tableType === 'model') {
    //         createTableAction += 'table.increments("id").unsigned().primary();';
    //     }

    //     createTableAction += 'table.timestamps();';

    //     Object.keys(model.columns).forEach((key) => {

    //         createTableAction += `table.${model.columns[key]}("${key}");`;
    //     });

    //     createTableAction += '}),';

    //     return createTableAction;
    // };

    // static getTableDropAction(model) {

    //     return `\nknex.schema.dropTableIfExists('${model.tableName}'),`;
    // };



    // static getModelActions(model) {

    //     const upActions = [];
    //     const downActions = [];

    //     const knexDbSchema = knexInstance.schema.createTable(tableName, (table) => {

    //         MigrationAssistant.log('createTable', tableName);

    //         const colNames = Object.keys(knexColumns);

    //         if (tableType === 'model') {
    //             table.increments('id').unsigned().primary();
    //         }

    //         table.timestamps();

    //         Object.keys(knexColumns).forEach((colName) => {

    //             table[knexColumns[colName]](colName);
    //         });

    //         /*
    //             Migration Changes here
    //         */

    //         migrationChanges.upActions.push(internals.getTableCreateAction(tableType, tableName, knexColumns));

    //         migrationChanges.downActions.push(`\nknex.schema.dropTableIfExists('${tableName}'),`);

    //         return cb(null, true);

    //     }).catch((err) => {

    //         return cb(err);
    //     });
    // }



    // static dropTableIfExists(tableType, tableName, migrationChanges, knexInstance, knexColumns, cb) {

    //     knexInstance.schema.hasTable(tableName).asCallback((err, exists) => {

    //         if (err) {
    //             return cb(err);
    //         }

    //         if (exists) {

    //             const knexDbSchema = knexInstance.schema.dropTable(tableName).asCallback((err, res) => {

    //                 if (err) {
    //                     throw new Error(err);
    //                 }

    //                 MigrationAssistant.log('dropTable', tableName);

    //                 /*
    //                     Migration Changes here
    //                 */
    //                 const createTableUpAction = `\nknex.schema.dropTableIfExists('${tableName}')`;
    //                 migrationChanges.upActions.push(createTableUpAction);

    //                 migrationChanges.downActions.push(internals.getTableCreateAction(tableType, tableName, knexColumns));

    //                 return cb(null, true);
    //             })
    //             .catch((err) => {

    //                 return cb(err);
    //             });
    //         }
    //         else {
    //             return cb(null, true);
    //         }
    //     })
    //     .catch((err) => {

    //         return cb(err);
    //     });
    // }



    // static alterTable(tableName, alters, migrationChanges, knexInstance, cb) {

    //     knexInstance.schema.hasTable(tableName).asCallback((err, exists) => {

    //         if (err) {
    //             return cb(err);
    //         }

    //         if (exists) {

    //             const knexDbSchema = knexInstance.schema.alterTable(tableName, (table) => {


    //                 //
    //                 MigrationAssistant.log('alterTable', `${tableName}->${columnName}`);


    //                 return cb(null, true);
    //             })
    //             .catch((err) => {

    //                 return cb(err);
    //             });
    //         }
    //         else {
    //             return cb(null, true);
    //         }
    //     })
    //     .catch((err) => {

    //         return cb(err);
    //     });
    // }
};