'use strict';

const Path = require('path');
const { Promise } = require('objection');
const Knex = require('knex');
const Hoek = require('hoek');

const Joi = require('joi');
const KnexUtils = require('./knexUtils');

class TestSession {

    static init() {

        if (this.staticInitCalled) {
            return;
        }

        registerUnhandledRejectionHandler();

        this.staticInitCalled = true;
    }

    static get optionsSchema() {

        return Joi.object({
            knexConfig: Joi.object({
                client: Joi.string().required(),
                connection: Joi.object().required(),
                migrations: Joi.string()
            }).unknown().required()
        });
    }

    static cloneSession(session, overrideOptions, cb) {

        if (typeof overrideOptions === 'function') {
            cb = overrideOptions;
            overrideOptions = null;
        }

        const options = Object.assign(
            {},
            Hoek.shallow(session.options),
            overrideOptions || {}
        );

        return new TestSession({ options }, cb);
    }

    constructor({ options }, cb) {

        Joi.assert(options, TestSession.optionsSchema);

        TestSession.init();

        this.options = options;
        this.client = options.knexConfig.client;
        this.knex = this.createKnex(options);

        // Check db connectivity

        this.initDb(cb);
    }

    createKnex(options) {

        return Knex(options.knexConfig);
    }

    initDb(cb) {

        if (!cb) {
            cb = () => {};
        }

        const knex = this.knex;
        const options = this.options;

        // Just ping the db first
        knex.queryBuilder().select(knex.raw('1'))
            .asCallback((err) => {

                if (err) {

                    const augmentedErr = new Error('Could not connect to '
                    + options.knexConfig.client
                    + '. Make sure the server is running and the database '
                    + options.knexConfig.connection.database
                    + ' is created. You can see the test database configurations from file '
                    + Path.join(__dirname, '../knexfile.js') + '.'
                    + ' Err msg: ' + err.message);

                    return cb(augmentedErr);
                };

                return cb();
            });
    }

    destroy() {

        return this.knex.destroy();
    }

    addUnhandledRejectionHandler(handler) {

        const handlers = TestSession.unhandledRejectionHandlers;
        handlers.push(handler);
    }

    removeUnhandledRejectionHandler(handler) {

        const handlers = TestSession.unhandledRejectionHandlers;
        handlers.splice(handlers.indexOf(handler), 1);
    }

    isPostgres() {

        return KnexUtils.isPostgres(this.knex);
    }

    isMySql() {

        return KnexUtils.isMySql(this.knex);
    }
}

TestSession.staticInitCalled = false;
TestSession.unhandledRejectionHandlers = [];

function registerUnhandledRejectionHandler() { // eslint-disable-line

    Promise.onPossiblyUnhandledRejection((err) => {

        if (TestSession.unhandledRejectionHandlers.length === 0) {
            console.error(err.stack);
        }

        TestSession.unhandledRejectionHandlers.forEach((handler) => {

            handler(err);
        });
    });
}

module.exports = TestSession;
