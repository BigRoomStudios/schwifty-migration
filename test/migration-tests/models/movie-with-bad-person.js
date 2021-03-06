'use strict';

const Joi = require('joi');
const Model = require('schwifty').Model;
const TestModels = require('./');

module.exports = class MovieWithBadPerson extends Model {

    static get tableName() {

        return 'MovieWithBadPerson';
    }

    static get joiSchema() {

        return Joi.object({
            id: Joi.number(),
            title: Joi.string(),
            subTitle: Joi.string(),
            sequel: Joi.alternatives([
                Joi.string(),
                Joi.object()
            ])
        });
    }

    static get relationMappings() {

        return {
            actors: {
                relation: Model.ManyToManyRelation,
                modelClass: TestModels.BadPerson,
                join: {
                    from: 'BadPerson.id',
                    through: {
                        from: 'Person_Movie.personId',
                        to: 'Person_Movie.movieId',
                        modelClass: TestModels.Person_Movie
                    },
                    to: 'MovieWithBadPerson.id'
                }
            }
        };
    }
};
