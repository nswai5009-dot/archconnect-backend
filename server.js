const http = require('http');
const { randomUUID } = require('crypto');
const url = require('url');

const PORT = process.env.PORT || 5000;

// ======================
// IN-MEMORY DATABASE
// ======================
let companies = [];
let projects = [];
let payments = [];

// Helper: send JSON response
function sendJSON(res, statusCode, data) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  });
  res.end(JSON.stringify(data));
}

// Helper: read request body
function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}

// ======================
// CREATE SERVER
// ======================
const server = http.createServer(async (req, res) => {
  const parsedUrl = url.parse(req.url, true);
  const path = parsedUrl.pathname;
  const method = req.method;

  // Handle CORS preflight
  if (method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    });
    return res.end();
  }

  try {
    // Health Check
    if (path === '/' && method === 'GET') {
      return sendJSON(res, 200, {
        status: 'success',
        message: 'ArchConnect Backend is running successfully!',
        version: '1.0.0'
      });
    }

    // POST /api/projects
    if (path === '/api/projects' && method === 'POST') {
      const body = await readBody(req);
      const { clientName, email, phone, location, projectType, description, budget, timeline } = body;

      if (!clientName || !email || !location || !projectType || !budget) {
        return sendJSON(res, 400, { success: false, error: 'Please fill all required fields' });
      }

      const newProject = {
        id: randomUUID(),
        clientName,
        email,
        phone: phone || null,
        location,
        projectType,
        description: description || '',
        budget,
        timeline: timeline || 'Flexible',
        status: 'open',
        createdAt: new Date().toISOString()
      };

      projects.push(newProject);
      return sendJSON(res, 201, {
        success: true,
        message: 'Project submitted successfully!',
        project: newProject
      });
    }

    // GET /api/projects
    if (path === '/api/projects' && method === 'GET') {
      const openProjects = projects.filter(p => p.status === 'open');
      return sendJSON(res, 200, {
        success: true,
        count: openProjects.length,
        projects: openProjects
      });
    }

    // POST /api/companies
    if (path === '/api/companies' && method === 'POST') {
      const body = await readBody(req);
      const { companyName, registrationNumber, location, yearsInOperation, description } = body;

      if (!companyName || !location) {
        return sendJSON(res, 400, { success: false, error: 'Company name and location are required' });
      }

      const newCompany = {
        id: randomUUID(),
        companyName,
        registrationNumber: registrationNumber || null,
        location,
        yearsInOperation: yearsInOperation || 0,
        description: description || '',
        staff: [],
        verified: false,
        createdAt: new Date().toISOString()
      };

      companies.push(newCompany);
      return sendJSON(res, 201, {
        success: true,
        message: 'Company registered successfully!',
        company: newCompany
      });
    }

    // GET /api/companies
    if (path === '/api/companies' && method === 'GET') {
      return sendJSON(res, 200, {
        success: true,
        count: companies.length,
        companies: companies
      });
    }

    // POST /api/companies/:id/staff
    if (path.startsWith('/api/companies/') && path.endsWith('/staff') && method === 'POST') {
      const companyId = path.split('/')[3];
      const body = await readBody(req);
      const { name, role, experience } = body;

      const company = companies.find(c => c.id === companyId);
      if (!company) {
        return sendJSON(res, 404, { success: false, error: 'Company not found' });
      }

      if (!name || !role) {
        return sendJSON(res, 400, { success: false, error: 'Name and role are required' });
      }

      company.staff.push({
        id: randomUUID(),
        name,
        role,
        experience: experience || 0
      });

      return sendJSON(res, 200, {
        success: true,
        message: 'Staff member added successfully',
        staff: company.staff
      });
    }

    // POST /api/payments/calculate
    if (path === '/api/payments/calculate' && method === 'POST') {
      const body = await readBody(req);
      const { projectAmount } = body;

      if (!projectAmount || isNaN(projectAmount) || projectAmount <= 0) {
        return sendJSON(res, 400, { success: false, error: 'Valid project amount is required' });
      }

      const amount = Number(projectAmount);
      const commission = Math.round(amount * 0.05);
      const amountToCompany = amount - commission;

      return sendJSON(res, 200, {
        success: true,
        projectAmount: amount,
        commissionRate: '5%',
        commissionAmount: commission,
        amountToCompany: amountToCompany,
        currency: 'TZS'
      });
    }

    // POST /api/payments/process
    if (path === '/api/payments/process' && method === 'POST') {
      const body = await readBody(req);
      const { projectId, amount, paymentMethod, phoneNumber } = body;

      if (!projectId || !amount || !paymentMethod) {
        return sendJSON(res, 400, { success: false, error: 'projectId, amount and paymentMethod are required' });
      }

      const commission = Math.round(amount * 0.05);
      const companyAmount = amount - commission;

      const paymentRecord = {
        id: randomUUID(),
        projectId,
        amount,
        paymentMethod,
        phoneNumber: phoneNumber || null,
        commission,
        companyAmount,
        status: 'completed',
        createdAt: new Date().toISOString()
      };

      payments.push(paymentRecord);

      const project = projects.find(p => p.id === projectId);
      if (project) project.status = 'paid';

      return sendJSON(res, 200, {
        success: true,
        message: `Payment of TZS ${Number(amount).toLocaleString()} processed via ${paymentMethod}`,
        payment: paymentRecord,
        note: 'This is a DEMO. Real M-Pesa integration requires official APIs.'
      });
    }

    // GET /api/payments
    if (path === '/api/payments' && method === 'GET') {
      return sendJSON(res, 200, {
        success: true,
        count: payments.length,
        payments: payments
      });
    }

    // 404
    sendJSON(res, 404, { success: false, error: 'Route not found' });

  } catch (err) {
    console.error('Server error:', err);
    sendJSON(res, 500, { success: false, error: 'Internal server error' });
  }
});

// Start server
server.listen(PORT, () => {
  console.log('ArchConnect Backend is ONLINE on port ' + PORT);
});
