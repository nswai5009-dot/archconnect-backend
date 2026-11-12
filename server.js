const http = require('http');
const { randomUUID } = require('crypto');
const url = require('url');

const PORT = process.env.PORT || 5000;
const SUPABASE_URL = (process.env.SUPABASE_URL || '').replace(/\/rest\/v1\/?$/, '');
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'ArchConnect2026';
const adminTokens = new Set();

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
      try { resolve(body ? JSON.parse(body) : {}); }
      catch (e) { reject(e); }
    });
    req.on('error', reject);
  });
}

function isAdmin(req) {
  const auth = req.headers['authorization'] || '';
  const token = auth.replace('Bearer ', '');
  return adminTokens.has(token);
}

async function sb(path, options = {}) {
  const res = await fetch(SUPABASE_URL + '/rest/v1/' + path, {
    ...options,
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': 'Bearer ' + SUPABASE_KEY,
      'Content-Type': 'application/json',
      'Prefer': options.prefer || 'return=representation',
      ...(options.headers || {})
    }
  });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok) {
    const err = new Error((data && data.message) || text || 'Supabase error');
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

function publicProject(p) {
  return {
    id: p.id,
    projectType: p.project_type,
    location: p.location,
    budget: p.budget,
    timeline: p.timeline,
    description: p.description,
    status: p.status,
    assignedCompanyId: p.assigned_company_id || null,
    assignedCompanyName: p.assigned_company_name || null,
    createdAt: p.created_at
  };
}

function publicCompany(c) {
  return {
    id: c.id,
    companyName: c.company_name,
    location: c.location,
    yearsInOperation: c.years_in_operation,
    description: c.description,
    staff: c.staff || [],
    verified: c.verified,
    createdAt: c.created_at
  };
}

function fullProject(p) {
  return {
    id: p.id,
    clientName: p.client_name,
    email: p.email,
    phone: p.phone,
    location: p.location,
    projectType: p.project_type,
    description: p.description,
    budget: p.budget,
    timeline: p.timeline,
    status: p.status,
    assignedCompanyId: p.assigned_company_id || null,
    assignedCompanyName: p.assigned_company_name || null,
    createdAt: p.created_at
  };
}

function fullCompany(c) {
  return {
    id: c.id,
    companyName: c.company_name,
    registrationNumber: c.registration_number,
    location: c.location,
    yearsInOperation: c.years_in_operation,
    description: c.description,
    staff: c.staff || [],
    verified: c.verified,
    createdAt: c.created_at
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
        version: '2.1.0-claims',
        storage: 'supabase'
      });
    }

    if (path === '/api/admin/login' && method === 'POST') {
      const body = await readBody(req);
      if (body.password === ADMIN_PASSWORD) {
        const token = randomUUID();
        adminTokens.add(token);
        return sendJSON(res, 200, { success: true, token, message: 'Admin login successful' });
      }
      return sendJSON(res, 401, { success: false, error: 'Wrong password' });
    }

    if (path === '/api/admin/projects' && method === 'GET') {
      if (!isAdmin(req)) return sendJSON(res, 401, { success: false, error: 'Admin access required' });
      const rows = await sb('projects?select=*&order=created_at.desc');
      return sendJSON(res, 200, { success: true, count: rows.length, projects: rows.map(fullProject) });
    }

    if (path === '/api/admin/companies' && method === 'GET') {
      if (!isAdmin(req)) return sendJSON(res, 401, { success: false, error: 'Admin access required' });
      const rows = await sb('companies?select=*&order=created_at.desc');
      return sendJSON(res, 200, { success: true, count: rows.length, companies: rows.map(fullCompany) });
    }

    if (path.startsWith('/api/admin/projects/') && method === 'DELETE') {
      if (!isAdmin(req)) return sendJSON(res, 401, { success: false, error: 'Admin access required' });
      const id = path.split('/')[4];
      await sb('projects?id=eq.' + id, { method: 'DELETE', prefer: 'return=minimal' });
      return sendJSON(res, 200, { success: true, message: 'Project deleted' });
    }

    if (path.startsWith('/api/admin/companies/') && path.endsWith('/verify') && method === 'POST') {
      if (!isAdmin(req)) return sendJSON(res, 401, { success: false, error: 'Admin access required' });
      const id = path.split('/')[4];
      const rows = await sb('companies?id=eq.' + id, {
        method: 'PATCH',
        body: JSON.stringify({ verified: true })
      });
      if (!rows || !rows.length) return sendJSON(res, 404, { success: false, error: 'Company not found' });
      return sendJSON(res, 200, { success: true, message: 'Company verified', company: fullCompany(rows[0]) });
    }

    if (path === '/api/projects' && method === 'POST') {
      const body = await readBody(req);
      const { clientName, email, phone, location, projectType, description, budget, timeline } = body;
      if (!clientName || !email || !location || !projectType || !budget) {
        return sendJSON(res, 400, { success: false, error: 'Please fill all required fields' });
      }
      const row = {
        id: randomUUID(),
        client_name: clientName,
        email,
        phone: phone || null,
        location,
        project_type: projectType,
        description: description || '',
        budget,
        timeline: timeline || 'Flexible',
        status: 'open',
        assigned_company_id: null,
        assigned_company_name: null,
        created_at: new Date().toISOString()
      };
      await sb('projects', { method: 'POST', body: JSON.stringify(row) });
      return sendJSON(res, 201, {
        success: true,
        message: 'Project submitted successfully!',
        project: { id: row.id, status: 'open' }
      });
    }

    if (path === '/api/projects' && method === 'GET') {
      const rows = await sb('projects?select=*&order=created_at.desc');
      return sendJSON(res, 200, {
        success: true,
        count: rows.length,
        projects: rows.map(publicProject)
      });
    }

    if (path.startsWith('/api/projects/') && path.endsWith('/claim') && method === 'POST') {
      const projectId = path.split('/')[3];
      const body = await readBody(req);
      const { companyId, companyName } = body;

      if (!companyName && !companyId) {
        return sendJSON(res, 400, { success: false, error: 'Company name or company ID is required' });
      }

      const rows = await sb('projects?id=eq.' + projectId + '&select=*');
      if (!rows || !rows.length) {
        return sendJSON(res, 404, { success: false, error: 'Project not found' });
      }
      const project = rows[0];
      if (project.status === 'taken' || project.assigned_company_name) {
        return sendJSON(res, 400, {
          success: false,
          error: 'This project is already taken by ' + (project.assigned_company_name || 'another company')
        });
      }

      let finalCompanyName = companyName;
      let finalCompanyId = companyId || null;

      if (companyId) {
        const cos = await sb('companies?id=eq.' + companyId + '&select=*');
        if (cos && cos.length) {
          finalCompanyName = cos[0].company_name;
          finalCompanyId = cos[0].id;
        }
      }

      const updated = await sb('projects?id=eq.' + projectId, {
        method: 'PATCH',
        body: JSON.stringify({
          status: 'taken',
          assigned_company_id: finalCompanyId,
          assigned_company_name: finalCompanyName
        })
      });

      return sendJSON(res, 200, {
        success: true,
        message: 'Project requested successfully. Assigned to ' + finalCompanyName,
        project: publicProject(updated[0] || {
          ...project,
          status: 'taken',
          assigned_company_id: finalCompanyId,
          assigned_company_name: finalCompanyName
        })
      });
    }

    if (path === '/api/companies' && method === 'POST') {
      const body = await readBody(req);
      const { companyName, registrationNumber, location, yearsInOperation, description } = body;
      if (!companyName || !location) {
        return sendJSON(res, 400, { success: false, error: 'Company name and location are required' });
      }
      const row = {
        id: randomUUID(),
        company_name: companyName,
        registration_number: registrationNumber || null,
        location,
        years_in_operation: yearsInOperation || 0,
        description: description || '',
        staff: [],
        verified: false,
        created_at: new Date().toISOString()
      };
      await sb('companies', { method: 'POST', body: JSON.stringify(row) });
      return sendJSON(res, 201, {
        success: true,
        message: 'Company registered successfully!',
        company: publicCompany(row)
      });
    }

    if (path === '/api/companies' && method === 'GET') {
      const rows = await sb('companies?select=*&order=created_at.desc');
      return sendJSON(res, 200, {
        success: true,
        count: rows.length,
        companies: rows.map(publicCompany)
      });
    }

    if (path.startsWith('/api/companies/') && path.endsWith('/staff') && method === 'POST') {
      const companyId = path.split('/')[3];
      const body = await readBody(req);
      const { name, role, experience } = body;
      if (!name || !role) {
        return sendJSON(res, 400, { success: false, error: 'Name and role are required' });
      }
      const rows = await sb('companies?id=eq.' + companyId + '&select=*');
      if (!rows || !rows.length) {
        return sendJSON(res, 404, { success: false, error: 'Company not found' });
      }
      const company = rows[0];
      const staff = Array.isArray(company.staff) ? company.staff : [];
      staff.push({ id: randomUUID(), name, role, experience: experience || 0 });
      await sb('companies?id=eq.' + companyId, {
        method: 'PATCH',
        body: JSON.stringify({ staff })
      });
      return sendJSON(res, 200, {
        success: true,
        message: 'Staff member added successfully',
        staff
      });
    }

    if (path === '/api/payments/calculate' && method === 'POST') {
      const body = await readBody(req);
      const { projectAmount } = body;
      if (!projectAmount || isNaN(projectAmount) || projectAmount <= 0) {
        return sendJSON(res, 400, { success: false, error: 'Valid project amount is required' });
      }
      const amount = Number(projectAmount);
      const commission = Math.round(amount * 0.05);
      return sendJSON(res, 200, {
        success: true,
        projectAmount: amount,
        commissionRate: '5%',
        commissionAmount: commission,
        amountToCompany: amount - commission,
        currency: 'TZS'
      });
    }

    sendJSON(res, 404, { success: false, error: 'Route not found' });
  } catch (err) {
    console.error('Server error:', err.message || err);
    sendJSON(res, err.status || 500, {
      success: false,
      error: err.message || 'Internal server error',
      details: err.data || null
    });
  }
});

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_KEY environment variables');
  process.exit(1);
}

server.listen(PORT, () => {
  console.log('ArchConnect Backend v2.1 (claims) ONLINE on port ' + PORT);
});
