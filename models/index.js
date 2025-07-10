"use strict";

require("dotenv").config();
const fs = require("fs");

const path = require("path");
const Sequelize = require("sequelize");
const basename = path.basename(__filename);
const env = process.env.NODE_ENV || "development";

const config = require(path.join(__dirname, "../", "config", "config.json"))[
  env
];

const db = {};

let sequelize;
// if (config.use_env_variable) {
//   sequelize = new Sequelize(process.env[config.use_env_variable], {
//     dialect: config.dialect,
//     protocol: config.protocol,
//     dialectOptions: config.dialectOptions,
//     pool: config.pool,
//     logging: config.logging
//   });
// } else {
//   sequelize = new Sequelize(
//     config.database, 
//     config.username, 
//     config.password, 
//     {
//       host: config.host,
//       dialect: config.dialect,
//       logging: config.logging
//     }
//   );
// }
sequelize = new Sequelize(
  "postgresql://postgres.vzoevdkkjwvfouogmbrj:6d8CrGJ1AwFZR6KM@aws-0-eu-central-1.pooler.supabase.com:5432/postgres",
  {
    dialect: "postgres",
    protocol: "postgres",
    dialectOptions: {
      ssl: {
        require: true,
        rejectUnauthorized: false, // For self-signed certificates (Supabase uses SSL)
      },
      pool: {
        max: 5,
        min: 0,
        acquire: 30000,
        idle: 10000
      },
    },
    logging: false, // Disable logging if not needed
  }
);

fs.readdirSync(__dirname)
  .filter((file) => {
    return (
      file.indexOf(".") !== 0 && file !== basename && file.slice(-3) === ".js"
    );
  })
  .forEach((file) => {
    const model = require(path.join(__dirname, file))(
      sequelize,
      Sequelize.DataTypes
    );
    db[model.name] = model;
  });

Object.keys(db).forEach((modelName) => {
  if (db[modelName].associate) {
    db[modelName].associate(db);
  }
});

db.sequelize = sequelize;
db.Sequelize = Sequelize;

module.exports = db;
