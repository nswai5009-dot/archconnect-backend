const http = require('http');
const { randomUUID } = require('crypto');
const url = require('url');

const PORT = process.env.PORT || 5000;

// ======================
// CONFIG
// ======================
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'ArchConnect2026';
const adminTokens = new Set();

// ======================
// IN-MEMORY DATABASE
// ======================
let companies = [];
let projects = [];
let payments = [];

function sendJSON(res, statusCode, data) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS, DELETE',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
  });
  res.end(JSON.stringify(data));
}

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

function isAdmin(req) {
  const auth = req.headers['authorization'] || '';
  const token = auth.replace('Bearer ', '');
  return adminTokens.has(token);
}

function publicProject(p) {
  return {
    id: p.id,
    projectType: p.projectType,
    location: p.location,
    budget: p.budget,
    timeline: p.timeline,
    description: p.description,
    status: p.status,
    createdAt: p.createdAt
  };
}

function publicCompany(c) {
  return {
    id: c.id,
    companyName: c.companyName,
    location: c.location,
    yearsInOperation: c.yearsInOperation,
    description: c.description,
    staff: c.staff,
    verified: c.verified,
    createdAt: c.createdAt
  };
}

const server = http.createServer(async (req, res) => {
  const parsedUrl = url.parse(req.url, true);
  const path = parsedUrl.pathname;
  const method = req.method;

  if (method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS, DELETE',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    });
    return res.end();
  }

  try {
    if (path === '/' && method === 'GET') {
      return sendJSON(res, 200, {
        status: 'success',
        message: 'ArchConnect Backend is running successfully!',
        version: '1.1.0'
      });
    }

    // ADMIN LOGIN
    if (path === '/api/admin/login' && method === 'POST') {
      const body = await readBody(req);
      if (body.password === ADMIN_PASSWORD) {
        const token = randomUUID();
        adminTokens.add(token);
        return sendJSON(res, 200, {
          success: true,
          token,
          message: 'Admin login successful'
        });
      }
      return sendJSON(res, 401, { success: false, error: 'Wrong password' });
    }

    // ADMIN FULL PROJECTS
    if (path === '/api/admin/projects' && method === 'GET') {
      if (!isAdmin(req)) {
        return sendJSON(res, 401, { success: false, error: 'Admin access required' });
      }
      return sendJSON(res, 200, {
        success: true,
        count: projects.length,
        projects: projects
      });
    }

    // ADMIN FULL COMPANIES
    if (path === '/api/admin/companies' && method === 'GET') {
      if (!isAdmin(req)) {
        return sendJSON(res, 401, { success: false, error: 'Admin access required' });
      }
      return sendJSON(res, 200, {
        success: true,
        count: companies.length,
        companies: companies
      });
    }

    // ADMIN DELETE PROJECT
    if (path.startsWith('/api/admin/projects/') && method === 'DELETE') {
      if (!isAdmin(req)) {
        return sendJSON(res, 401, { success: false, error: 'Admin access required' });
      }
      const id = path.split('/')[4];
      const before = projects.length;
      projects = projects.filter(p => p.id !== id);
      return sendJSON(res, 200, {
        success: true,
        message: projects.length < before ? 'Project deleted' : 'Project not found'
      });
    }

    // ADMIN VERIFY COMPANY
    if (path.startsWith('/api/admin/companies/') && path.endsWith('/verify') && method === 'POST') {
      if (!isAdmin(req)) {
        return sendJSON(res, 401, { success: false, error: 'Admin access required' });
      }
      const id = path.split('/')[4];
      const company = companies.find(c => c.id === id);
      if (!company) {
        return sendJSON(res, 404, { success: false, error: 'Company not found' });
      }
      company.verified = true;
      return sendJSON(res, 200, { success: true, message: 'Company verified', company });
    }

    // PUBLIC POST PROJECT
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
        project: { id: newProject.id, status: newProject.status }
      });
    }

    // PUBLIC LIST PROJECTS - no private client data
    if (path === '/api/projects' && method === 'GET') {
      const openProjects = projects.filter(p => p.status === 'open').map(publicProject);
      return sendJSON(res, 200, {
        success: true,
        count: openProjects.length,
        projects: openProjects
      });
    }

    // PUBLIC REGISTER COMPANY
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
        company: publicCompany(newCompany)
      });
    }

    // PUBLIC LIST COMPANIES
    if (path === '/api/companies' && method === 'GET') {
      return sendJSON(res, 200, {
        success: true,
        count: companies.length,
        companies: companies.map(publicCompany)
      });
    }

    // ADD STAFF
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

    // COMMISSION
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

    sendJSON(res, 404, { success: false, error: 'Route not found' });

  } catch (err) {
    console.error('Server error:', err);
    sendJSON(res, 500, { success: false, error: 'Internal server error' });
  }
});

server.listen(PORT, () => {
  console.log('ArchConnect Backend v1.1 is ONLINE on port ' + PORT);
});
