'use strict';

// Load modules

const Os = require('os');
const Fs = require('fs');
const Path = require('path');

const Lab = require('lab');
const Code = require('code');

const KnexConfigs = require('./knexfile');
const TestSession = require('./utils/TestSession');
const TestSuiteRunner = require('./utils/TestSuiteRunner');
const SchwiftyMigration = require('../lib');
const MigrationMaps = require('../lib/mappings').maps;
const Promise = require('bluebird');

// Test shortcuts

const lab = exports.lab = Lab.script({ schedule: false });
const expect = Code.expect;
const { describe, it, afterEach } = lab;
const Utils = require('./utils');

const internals = {};

afterEach((done) => {

    const { sessionForAfter, rollbackPath } = internals;

    if (rollbackPath) {

        // Wipe the db!

        Utils.rollbackDb(sessionForAfter, rollbackPath, (err) => {

            if (err) {
                return done(err);
            }

            internals.sessionForAfter = undefined;
            done();
        });
    }
    else {
        internals.sessionForAfter = undefined;
        internals.rollbackPath = undefined;

        if (!sessionForAfter) {
            return done();
        }

        sessionForAfter.knex.destroy().asCallback(done);
    }
});

const setOptionsForAfter = (session, rollbackPath) => {

    internals.sessionForAfter = session;
    internals.rollbackPath = rollbackPath;
};

const testUtils = {
    lab,
    expect,
    utils: Utils,
    setOptionsForAfter
};

const envDB = process.env.DB;
const testDb = envDB || 'postgres';

const knexConfig = KnexConfigs.find((conf) => conf.client === testDb);

if (!knexConfig) {
    throw new Error(`Unsupported db "${testDb}"`);
}

describe('SchwiftyMigration', () => {

    const makeSession = (cb) => {

        const session = new TestSession({ options: { knexConfig } },
            (err) => {

                setOptionsForAfter(session);
                cb(err, session);
            });
    };

    const failKnexWith = (knex, toErrorOn, errMsg, afterTries) => {

        afterTries = afterTries || 1;

        // Grabbed this technique from https://github.com/tgriesser/knex/blob/2e1a459a9e740f24b9a4647bd4da427854e551dd/test/integration/logger.js#L89-L108

        const originalQb = knex.queryBuilder;
        knex.queryBuilder = () => {

            const qb = originalQb.apply(this, arguments);
            const origToErrorFunc = qb[toErrorOn].bind(qb);

            qb[toErrorOn] = (...args) => {

                if (--afterTries === 0) {
                    return Promise.reject(new Error(errMsg));
                }
                return origToErrorFunc(...args);
            };
            return qb;
        };

        return knex;
    };

    it('accepts absolute and relative migration file paths', (done) => {

        makeSession((err, session) => {

            if (err) {
                return done(err);
            }

            const absolutePath = Path.join(process.cwd(), 'test/migration-tests/migrations');
            const relativePath = './test/migration-tests/migrations';

            SchwiftyMigration.genMigrationFile({
                models: [require('./migration-tests/Dog')],
                migrationsDir: absolutePath,
                knex: session.knex,
                mode: 'alter'
            }, (err) => {

                expect(err).to.not.exist();

                SchwiftyMigration.genMigrationFile({
                    models: [require('./migration-tests/Dog')],
                    migrationsDir: relativePath,
                    knex: session.knex,
                    mode: 'alter'
                }, (err) => {

                    expect(err).to.not.exist();

                    Fs.readdirSync(absolutePath)
                        .forEach((migrationFile) => {

                            const filePath = Path.join(absolutePath, migrationFile);
                            Fs.unlinkSync(filePath);
                        });

                    done();
                });
            });
        });
    });

    it('returns NO_MIGRATION when the db and models are in sync (no-op)', (done) => {

        makeSession((err, session) => {

            if (err) {
                return done(err);
            }

            const migrationsDir = './test/migration-tests/migrations';
            const seedPath = './test/migration-tests/seed';

            testUtils.setOptionsForAfter(session, seedPath);

            session.knex.migrate.latest({
                directory: seedPath
            })
                .asCallback((err) => {

                    if (err) {
                        return done(err);
                    }

                    SchwiftyMigration.genMigrationFile({
                        models: [require('./migration-tests/Person')],
                        migrationsDir,
                        knex: session.knex,
                        mode: 'alter'
                    }, (err, output) => {

                        expect(err).to.not.exist();

                        expect(Utils.compareOutput(output, {
                            code: SchwiftyMigration.returnCodes.NO_MIGRATION,
                            file: null,
                            skippedColumns: []
                        })).to.equal(true);

                        Fs.readdirSync(migrationsDir)
                            .forEach((migrationFile) => {

                                const filePath = Path.join(migrationsDir, migrationFile);
                                Fs.unlinkSync(filePath);
                            });

                        done();
                    });
                });
        });
    });

    it('returns NO_MIGRATION if no models passed', (done) => {

        makeSession((err, session) => {

            if (err) {
                return done(err);
            }

            SchwiftyMigration.genMigrationFile({
                models: [],
                migrationsDir: 'some/path',
                knex: session.knex,
                mode: 'alter'
            }, (err, output) => {

                expect(err).to.not.exist();

                expect(Utils.compareOutput(output, {
                    code: SchwiftyMigration.returnCodes.NO_MIGRATION,
                    file: null,
                    skippedColumns: []
                })).to.equal(true);

                done();
            });
        });
    });

    it('suppresses alter and drop actions if mode is not set to "alter"', (done) => {

        makeSession((err, session) => {

            if (err) {
                return done(err);
            }

            const migrationsDir = './test/migration-tests/migrations';
            const seedPath = './test/migration-tests/seed';

            testUtils.setOptionsForAfter(session, seedPath);

            session.knex.migrate.latest({
                directory: seedPath
            })
                .asCallback((err) => {

                    if (err) {
                        return done(err);
                    }

                    SchwiftyMigration.genMigrationFile({
                        models: [require('./migration-tests/AlterPerson')],
                        migrationsDir,
                        knex: session.knex,
                        mode: 'create'
                    }, (err) => {

                        expect(err).to.not.exist();

                        const expectedMigrationPath = './test/migration-tests/mode-enforcement/create-mode/expected-migration.js';
                        const actualMigrationContents = testUtils.utils.getLatestMigration(migrationsDir);
                        const expectedMigrationContents = Fs.readFileSync(expectedMigrationPath).toString('utf8');

                        expect(actualMigrationContents).to.equal(expectedMigrationContents);

                        Fs.readdirSync(migrationsDir)
                            .forEach((migrationFile) => {

                                const filePath = Path.join(migrationsDir, migrationFile);
                                Fs.unlinkSync(filePath);
                            });

                        done();
                    });
                });
        });
    });

    it('returns generated migration file path on success', (done) => {

        makeSession((err, session) => {

            if (err) {
                return done(err);
            }

            const absolutePath = Path.join(process.cwd(), 'test/migration-tests/migrations');

            SchwiftyMigration.genMigrationFile({
                models: [require('./migration-tests/Dog')],
                migrationsDir: absolutePath,
                knex: session.knex,
                mode: 'alter'
            }, (err, output) => {

                expect(err).to.not.exist();

                expect(Utils.compareOutput(output, {
                    code: SchwiftyMigration.returnCodes.MIGRATION,
                    file: 'truthy',
                    skippedColumns: []
                })).to.equal(true);

                Fs.readdirSync(absolutePath)
                    .forEach((migrationFile) => {

                        const filePath = Path.join(absolutePath, migrationFile);
                        Fs.unlinkSync(filePath);
                    });

                done();
            });
        });
    });

    // All the errors

    it('errors if you give bad options', (done) => {

        SchwiftyMigration.genMigrationFile({
            invalid: 'options!'
        }, (err) => {

            expect(err).to.exist();
            expect(err.message).to.equal('Bad options passed to schwifty-migration: child \"migrationsDir\" fails because [\"migrationsDir\" is required]');
            done();
        });
    });

    // it('errors when Fs.writeFile fails', (done) => {
    //
    //     makeSession((err, session) => {
    //
    //         if (err) {
    //             return done(err);
    //         }
    //
    //         const origWriteFile = Fs.writeFile;
    //         Fs.writeFile = (...args) => {
    //
    //             const cb = args.pop();
    //             cb(new Error('write failed'));
    //         };
    //
    //         const absolutePath = Path.join(process.cwd(), 'test/migration-tests/migrations');
    //
    //         SchwiftyMigration.genMigrationFile({
    //             models: [require('./migration-tests/Dog')],
    //             migrationsDir: absolutePath,
    //             knex: session.knex,
    //             mode: 'alter'
    //         }, (err) => {
    //
    //             expect(err).to.exist();
    //             expect(err.message).to.equal('write failed');
    //
    //             // console.log('err.message', err.message);
    //
    //             Fs.writeFile = origWriteFile;
    //             done();
    //         });
    //     });
    // });

    it('errors on a knex that isn\'t pingable', (done) => {

        makeSession((err, session) => {

            if (err) {
                return done(err);
            }

            const badKnex = failKnexWith(session.knex, 'select', 'Not pingable');

            SchwiftyMigration.genMigrationFile({
                models: [require('./migration-tests/Dog')],
                migrationsDir: 'some/path',
                knex: badKnex,
                mode: 'alter'
            }, (err) => {

                expect(err).to.exist();
                expect(err.message).to.equal('Not pingable');

                done();
            });
        });
    });

    it('errors on a knex that has issues pinging a table', (done) => {

        makeSession((err, session) => {

            if (err) {
                return done(err);
            }

            // The first time schwifty-migration uses `select` is when pinging the
            // db for general connectivity. The next time it uses `select` will be
            // when pinging for each table's existance in the db

            // So we ask failKnexWith to fail after 2 tries to make it work correctly for the first select
            // and fail on the 2nd one.
            const badKnex = failKnexWith(session.knex, 'select', 'Error when pinging table', 2);

            SchwiftyMigration.genMigrationFile({
                models: [require('./migration-tests/Dog')],
                migrationsDir: 'some/path',
                knex: badKnex,
                mode: 'alter'
            }, (err) => {

                expect(err).to.exist();
                expect(err.message).to.equal('Error when pinging table');

                done();
            });
        });
    });

    it('errors if knex migrate fails', (done) => {

        makeSession((err, session) => {

            if (err) {
                return done(err);
            }

            // Setting the migrations dir path to a file
            const absoluteBadPath = Path.join(process.cwd(), 'test/migration-tests/Person.js');

            SchwiftyMigration.genMigrationFile({
                models: [require('./migration-tests/Dog')],
                migrationsDir: absoluteBadPath,
                knex: session.knex,
                mode: 'alter'
            }, (err) => {

                expect(err).to.exist();
                expect(err.message).to.include('ENOTDIR: not a directory, open \'' + absoluteBadPath);
                done();
            });
        });
    });

    it('informs user of skipped unsupported db column types with other changes', (done) => {

        makeSession((err, session) => {

            if (err) {
                return done(err);
            }

            const migrationsDir = './test/migration-tests/migrations';
            const seedPath = './test/migration-tests/seed';

            testUtils.setOptionsForAfter(session, seedPath);

            session.knex.migrate.latest({
                directory: seedPath
            })
                .asCallback((err) => {

                    if (err) {
                        return done(err);
                    }

                    let rawQuery;
                    let expectedOutput;

                    if (session.isPostgres()) {
                        rawQuery = 'ALTER TABLE "Person" ADD weirdo_psql_column polygon';
                        expectedOutput = {
                            code: SchwiftyMigration.returnCodes.MIGRATION,
                            file: 'truthy',
                            skippedColumns: ['polygon']
                        };
                    }
                    else if (session.isMySql()) {
                        rawQuery = 'ALTER TABLE "Person" ADD weirdo_mysql_column geometry';
                        expectedOutput = {
                            code: SchwiftyMigration.returnCodes.MIGRATION,
                            file: 'truthy',
                            skippedColumns: ['geometry']
                        };
                    }
                    else {
                        return done(new Error('Db not supported'));
                    }

                    session.knex.raw(rawQuery)
                        .asCallback((alterErr) => {

                            if (alterErr) {
                                return done(alterErr);
                            }

                            SchwiftyMigration.genMigrationFile({
                                models: [require('./migration-tests/AlterPerson')],
                                migrationsDir,
                                knex: session.knex,
                                mode: 'alter'
                            }, (err, output) => {

                                expect(err).to.not.exist();

                                expect(Utils.compareOutput(output, expectedOutput)).to.equal(true);

                                Fs.readdirSync(migrationsDir)
                                    .forEach((migrationFile) => {

                                        const filePath = Path.join(migrationsDir, migrationFile);
                                        Fs.unlinkSync(filePath);
                                    });

                                done();
                            });
                        });
                });
        });
    });

    it('informs user of skipped unsupported db column types and no other changes', (done) => {

        makeSession((err, session) => {

            if (err) {
                return done(err);
            }

            const migrationsDir = './test/migration-tests/migrations';
            const seedPath = './test/migration-tests/seed';

            testUtils.setOptionsForAfter(session, seedPath);

            session.knex.migrate.latest({
                directory: seedPath
            })
                .asCallback((err) => {

                    if (err) {
                        return done(err);
                    }

                    let rawQuery;
                    let expectedOutput;

                    if (session.isPostgres()) {
                        rawQuery = 'ALTER TABLE "Person" ADD weirdo_psql_column polygon';
                        expectedOutput = {
                            code: SchwiftyMigration.returnCodes.NO_MIGRATION,
                            file: null,
                            skippedColumns: ['polygon']
                        };
                    }
                    else if (session.isMySql()) {
                        rawQuery = 'ALTER TABLE "Person" ADD weirdo_mysql_column geometry';
                        expectedOutput = {
                            code: SchwiftyMigration.returnCodes.NO_MIGRATION,
                            file: null,
                            skippedColumns: ['geometry']
                        };
                    }
                    else {
                        return done(new Error('Db not supported'));
                    }

                    session.knex.raw(rawQuery)
                        .asCallback((alterErr) => {

                            if (alterErr) {
                                return done(alterErr);
                            }

                            SchwiftyMigration.genMigrationFile({
                                models: [require('./migration-tests/Person')],
                                migrationsDir,
                                knex: session.knex,
                                mode: 'alter'
                            }, (err, output) => {

                                expect(err).to.not.exist();

                                expect(Utils.compareOutput(output, expectedOutput)).to.equal(true);

                                Fs.readdirSync(migrationsDir)
                                    .forEach((migrationFile) => {

                                        const filePath = Path.join(migrationsDir, migrationFile);
                                        Fs.unlinkSync(filePath);
                                    });

                                done();
                            });
                        });
                });
        });
    });

    it('informs user of skipped unsupported db column types on join table', (done) => {

        makeSession((err, session) => {

            if (err) {
                return done(err);
            }

            const migrationsDir = './test/migration-tests/migrations';
            const seedPath = './test/migration-tests/seed-join';

            testUtils.setOptionsForAfter(session, seedPath);

            session.knex.migrate.latest({
                directory: seedPath
            })
                .asCallback((err) => {

                    if (err) {
                        return done(err);
                    }

                    let rawQuery;
                    let expectedOutput;

                    if (session.isPostgres()) {
                        rawQuery = 'ALTER TABLE "Person_Movie" ADD weirdo_psql_column polygon';

                        expectedOutput = {
                            code: SchwiftyMigration.returnCodes.NO_MIGRATION,
                            file: null,
                            skippedColumns: ['polygon']
                        };
                    }
                    else if (session.isMySql()) {
                        rawQuery = 'ALTER TABLE "Person_Movie" ADD weirdo_mysql_column geometry';

                        expectedOutput = {
                            code: SchwiftyMigration.returnCodes.NO_MIGRATION,
                            file: null,
                            skippedColumns: ['geometry']
                        };
                    }
                    else {
                        return done(new Error('Db not supported'));
                    }

                    session.knex.raw(rawQuery)
                        .asCallback((alterErr) => {

                            if (alterErr) {
                                return done(alterErr);
                            }

                            SchwiftyMigration.genMigrationFile({
                                models: [
                                    require('./migration-tests/Person'),
                                    require('./migration-tests/Movie')
                                ],
                                migrationsDir,
                                knex: session.knex,
                                mode: 'alter'
                            }, (err, output) => {

                                expect(err).to.not.exist();

                                expect(Utils.compareOutput(output, expectedOutput)).to.equal(true);

                                Fs.readdirSync(migrationsDir)
                                    .forEach((migrationFile) => {

                                        const filePath = Path.join(migrationsDir, migrationFile);
                                        Fs.unlinkSync(filePath);
                                    });

                                done();
                            });
                        });
                });
        });
    });

    it('errors on unsupported Joi schema in model', (done) => {

        makeSession((err, session) => {

            if (err) {
                return done(err);
            }

            const absolutePath = Path.join(process.cwd(), 'test/migration-tests/migrations');

            SchwiftyMigration.genMigrationFile({
                models: [require('./migration-tests/BadPerson')],
                migrationsDir: absolutePath,
                knex: session.knex,
                mode: 'alter'
            }, (err) => {

                expect(err).to.exist();
                expect(err.message).to.equal('Joi Schema type(s) "alternatives" not supported in model "BadPerson".');
                done();
            });
        });
    });

    it('errors when knex\'s columnInfo fails for regular model', (done) => {

        makeSession((err, session) => {

            if (err) {
                return done(err);
            }

            const badKnex = failKnexWith(session.knex, 'columnInfo', 'Column info fail regular model');

            SchwiftyMigration.genMigrationFile({
                models: [require('./migration-tests/Dog')],
                migrationsDir: 'some/path',
                knex: badKnex,
                mode: 'alter'
            }, (err) => {

                expect(err).to.exist();
                expect(err.message).to.equal('Column info fail regular model');

                done();
            });
        });
    });

    it('errors when knex\'s columnInfo fails for join table', (done) => {

        makeSession((err, session) => {

            if (err) {
                return done(err);
            }

            const badKnex = failKnexWith(session.knex, 'columnInfo', 'Column info fail join table');

            SchwiftyMigration.genMigrationFile({
                models: [
                    require('./migration-tests/Person'),
                    require('./migration-tests/Movie'),
                    require('./migration-tests/Person_Movie')
                ],
                migrationsDir: 'some/path',
                knex: badKnex,
                mode: 'alter'
            }, (err) => {

                expect(err).to.exist();
                expect(err.message).to.equal('Column info fail join table');

                done();
            });
        });
    });

    it('errors when a join table uses an unsupported Joi schema', (done) => {

        makeSession((err, session) => {

            if (err) {
                return done(err);
            }

            const absolutePath = Path.join(process.cwd(), 'test/migration-tests/migrations');

            SchwiftyMigration.genMigrationFile({
                models: [
                    require('./migration-tests/Person'),
                    require('./migration-tests/BadMovie'),
                    require('./migration-tests/Bad_Person_Movie')
                ],
                migrationsDir: absolutePath,
                knex: session.knex,
                mode: 'alter'
            }, (err) => {

                expect(err).to.exist();
                expect(err.message).to.equal('Joi Schema type(s) "alternatives" not supported in model "Bad_Person_Movie".');

                done();
            });
        });
    });

    it('errors when a join table uses multiple unsupported Joi schema features', (done) => {

        makeSession((err, session) => {

            if (err) {
                return done(err);
            }

            const absolutePath = Path.join(process.cwd(), 'test/migration-tests/migrations');

            SchwiftyMigration.genMigrationFile({
                models: [
                    require('./migration-tests/Person'),
                    require('./migration-tests/DoubleBadMovie'),
                    require('./migration-tests/Double_Bad_Person_Movie')
                ],
                migrationsDir: absolutePath,
                knex: session.knex,
                mode: 'alter'
            }, (err) => {

                expect(err).to.exist();
                expect(err.message).to.equal('Joi Schema type(s) "alternatives, alternatives" not supported in model "Double_Bad_Person_Movie".');

                done();
            });
        });
    });

    it('errors when multiple tables use unsupported Joi schema features', (done) => {

        makeSession((err, session) => {

            if (err) {
                return done(err);
            }

            const absolutePath = Path.join(process.cwd(), 'test/migration-tests/migrations');

            SchwiftyMigration.genMigrationFile({
                models: [
                    require('./migration-tests/BadPerson'),
                    require('./migration-tests/BadZombie')
                ],
                migrationsDir: absolutePath,
                knex: session.knex,
                mode: 'alter'
            }, (err) => {

                expect(err).to.exist();
                expect(err.message).to.equal('Multiple errors:' + Os.EOL +
                'Joi Schema type(s) "alternatives" not supported in model "BadPerson".' + Os.EOL +
                'Joi Schema type(s) "alternatives" not supported in model "BadZombie".');

                done();
            });
        });
    });

    describe('mappings.js', () => {

        it('maintains parity between output of db2ColumnCompiler and input of columnCompiler2Knex', (done) => {

            const aliasKeys = Object.keys(MigrationMaps.aliasMap);
            const columnCompilerKnexMapKeys = Object.keys(MigrationMaps.columnCompilerKnexMap);

            aliasKeys.forEach((key) => {

                expect(columnCompilerKnexMapKeys.includes(key)).to.equal(true);
            });

            done();
        });
    });

    // Generated, file-based tests (uses the migration-tests folder)

    it('creates new tables and columns', (done) => {

        makeSession((err, session) => {

            if (err) {
                return done(err);
            }

            // Run migration tests for `create`
            const createRunner = new TestSuiteRunner('create', session, testUtils);
            createRunner.genTests();

            done();
        });
    });

    it('alters tables', (done) => {

        makeSession((err, session) => {

            if (err) {
                return done(err);
            }

            // Run migration tests for `alter`
            const alterRunner = new TestSuiteRunner('alter', session, testUtils);
            alterRunner.genTests();

            done();
        });
    });

    it('integration testing', (done) => {

        makeSession((err, session) => {

            if (err) {
                return done(err);
            }

            // Run migration tests for `alter`
            const integrationRunner = new TestSuiteRunner('integrated', session, testUtils);
            integrationRunner.genTests();

            done();
        });
    });
});
