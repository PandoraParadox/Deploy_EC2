const fs = require('node:fs');
const path = require('node:path');
const Database = require('better-sqlite3');
const { Pool } = require('pg');

const postgresUrl = process.env.DATABASE_URL;

if (postgresUrl) {
	const pool = new Pool({
		connectionString: postgresUrl,
		ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false }
	});

	module.exports = {
		driver: 'postgres',
		async init() {
			await pool.query(fs.readFileSync(path.join(__dirname, 'schema.postgres.sql'), 'utf8'));
		},
		async query(sql, params = []) {
			const result = await pool.query(sql, params);
			return result.rows;
		},
		async close() {
			await pool.end();
		}
	};
} else {
	const dataDir = path.join(__dirname, 'data');
	fs.mkdirSync(dataDir, { recursive: true });

	const db = new Database(path.join(dataDir, 'launchpad.db'));
	db.pragma('foreign_keys = ON');
	db.exec(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));

	module.exports = {
		driver: 'sqlite',
		async init() {},
		async query(sql, params = []) {
			const sqliteSql = sql.replace(/\$(\d+)/g, '?');
			const statement = db.prepare(sqliteSql);
			if (/\bSELECT\b|\bRETURNING\b/i.test(sqliteSql)) {
				return statement.all(...params);
			}
			statement.run(...params);
			return [];
		},
		async close() {
			db.close();
		}
	};
}
