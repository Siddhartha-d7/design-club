const API_URL = 'http://localhost:5000/api';

/**
 * Helper to get authorization headers.
 */
const getHeaders = (isMultipart = false) => {
  const token = localStorage.getItem('token');
  const headers = {};
  
  if (!isMultipart) {
    headers['Content-Type'] = 'application/json';
  }
  
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  
  return headers;
};

export const api = {
  // Authentication
  async register(userData) {
    const response = await fetch(`${API_URL}/auth/register`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(userData),
    });
    return response.json();
  },

  async login(credentials) {
    const response = await fetch(`${API_URL}/auth/login`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(credentials),
    });
    return response.json();
  },

  // Daily Topics
  async getTopics() {
    const response = await fetch(`${API_URL}/topics`, {
      method: 'GET',
      headers: getHeaders(),
    });
    return response.json();
  },

  async updateTopic(dayNumber, topicData) {
    const response = await fetch(`${API_URL}/topics/${dayNumber}`, {
      method: 'PUT',
      headers: getHeaders(),
      body: JSON.stringify(topicData),
    });
    return response.json();
  },

  // Student portal
  async getStudentDashboard(cycle = '') {
    const url = cycle ? `${API_URL}/student/dashboard?cycle=${cycle}` : `${API_URL}/student/dashboard`;
    const response = await fetch(url, {
      method: 'GET',
      headers: getHeaders(),
    });
    return response.json();
  },

  async uploadTask(formData) {
    // Note: for file uploads, browser sets the boundaries, so headers must NOT contain 'Content-Type'
    const response = await fetch(`${API_URL}/student/upload`, {
      method: 'POST',
      headers: getHeaders(true),
      body: formData,
    });
    return response.json();
  },

  // Leaderboard
  async getLeaderboard(cycle = '') {
    const url = cycle ? `${API_URL}/leaderboard?cycle=${cycle}` : `${API_URL}/leaderboard`;
    const response = await fetch(url, {
      method: 'GET',
      headers: getHeaders(),
    });
    return response.json();
  },

  // Coordinator admin
  async getAdminStudents(cycle = '') {
    const url = cycle ? `${API_URL}/admin/students?cycle=${cycle}` : `${API_URL}/admin/students`;
    const response = await fetch(url, {
      method: 'GET',
      headers: getHeaders(),
    });
    return response.json();
  },

  async getAdminUploads(cycle = '') {
    const url = cycle ? `${API_URL}/admin/uploads?cycle=${cycle}` : `${API_URL}/admin/uploads`;
    const response = await fetch(url, {
      method: 'GET',
      headers: getHeaders(),
    });
    return response.json();
  },

  async getStudentUploadsDetail(studentId, cycle = '') {
    const url = cycle ? `${API_URL}/admin/student/${studentId}/uploads?cycle=${cycle}` : `${API_URL}/admin/student/${studentId}/uploads`;
    const response = await fetch(url, {
      method: 'GET',
      headers: getHeaders(),
    });
    return response.json();
  },

  async evaluateUpload(uploadId, evaluationData) {
    const response = await fetch(`${API_URL}/admin/uploads/${uploadId}/evaluate`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(evaluationData),
    });
    return response.json();
  },

  async adjustStudentPoints(studentId, adjustmentData) {
    const response = await fetch(`${API_URL}/admin/students/${studentId}/adjust-points`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(adjustmentData),
    });
    return response.json();
  },

  async pickInsta(uploadId, pickType = null) {
    const bodyObj = pickType ? { pick_type: pickType } : {};
    const response = await fetch(`${API_URL}/admin/uploads/${uploadId}/pick-insta`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(bodyObj),
    });
    return response.json();
  },

  async getInstaPicks(cycle = '') {
    const url = cycle ? `${API_URL}/admin/insta-picks?cycle=${cycle}` : `${API_URL}/admin/insta-picks`;
    const response = await fetch(url, {
      method: 'GET',
      headers: getHeaders(),
    });
    return response.json();
  },

  async createPoll(cycle = '') {
    const url = cycle ? `${API_URL}/admin/polls/create?cycle=${cycle}` : `${API_URL}/admin/polls/create`;
    const response = await fetch(url, {
      method: 'POST',
      headers: getHeaders(),
    });
    return response.json();
  },

  async getActivePoll() {
    const response = await fetch(`${API_URL}/polls/active`, {
      method: 'GET',
      headers: getHeaders(),
    });
    return response.json();
  },

  async submitVote(pollId, uploadId) {
    const response = await fetch(`${API_URL}/polls/${pollId}/vote`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ upload_id: uploadId }),
    });
    return response.json();
  },

  async getAdminPolls(cycle = '') {
    const url = cycle ? `${API_URL}/admin/polls?cycle=${cycle}` : `${API_URL}/admin/polls`;
    const response = await fetch(url, {
      method: 'GET',
      headers: getHeaders(),
    });
    return response.json();
  },

  async endPoll(pollId) {
    const response = await fetch(`${API_URL}/admin/polls/${pollId}/end`, {
      method: 'POST',
      headers: getHeaders(),
    });
    return response.json();
  },

  // Helper to format image paths
  getImageUrl(path) {
    if (!path) return '';
    return `http://localhost:5000${path}`;
  }
};
