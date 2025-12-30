const request = require('supertest');
const app = require('../server');
const db = require('../db');

describe('API Endpoints', () => {
    // Basic connectivity test
    it('GET / should return 200 and index.html', async () => {
        const res = await request(app).get('/');
        expect(res.statusCode).toEqual(200);
        expect(res.type).toBe('text/html');
    });

    // Test Users API
    it('GET /api/users should return a list of users', async () => {
        const res = await request(app).get('/api/users');
        expect(res.statusCode).toEqual(200);
        expect(res.body.success).toBe(true);
        expect(Array.isArray(res.body.users)).toBe(true);
    });

    // Cleanup after tests
    afterAll((done) => {
        db.close((err) => {
            if (err) console.error(err.message);
            done();
        });
    });
});
