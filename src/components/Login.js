import React, { useState, useEffect } from 'react';
import './Login.css';
import { FaUser, FaLock } from 'react-icons/fa';
import { useNavigate } from 'react-router-dom';

const Login = ({ onLogin }) => {
  const navigate = useNavigate();
  const [credentials, setCredentials] = useState({ username: '', password: '' });
  const [rememberMe, setRememberMe] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // On mount, load saved credentials if any
  useEffect(() => {
    const saved = localStorage.getItem('savedCredentials');
    if (saved) {
      const { username, password } = JSON.parse(saved);
      setCredentials({ username, password });
      setRememberMe(true);
    }
  }, []);

  const handleChange = e => {
    setCredentials(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async e => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const response = await fetch('http://localhost:5000/login', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(credentials),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message);

      // Save or clear stored creds
      if (rememberMe) {
        localStorage.setItem('savedCredentials', JSON.stringify(credentials));
      } else {
        localStorage.removeItem('savedCredentials');
      }

      onLogin(credentials.username, data.role_id, data.user_id);
      navigate(data.role_id === 1 ? '/Admin-dashboard' : '/user-dashboard');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-container">
      <div className="login-left">
        <div className="overlay">
          <h1>SquareCloud Inventory System</h1>
        </div>
      </div>
      <div className="login-right">
        <h2>Welcome to SquareCloud Inventory System</h2>
        <p>Access your inventory dashboard — manage stock, track usage, and optimize operations.</p>
        {error && <p className="error-message">{error}</p>}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <FaUser className="icon" />
            <input
              name="username"
              type="text"
              placeholder="Username"
              value={credentials.username}
              onChange={handleChange}
              required
            />
          </div>
          <div className="form-group">
            <FaLock className="icon" />
            <input
              name="password"
              type="password"
              placeholder="Password"
              value={credentials.password}
              onChange={handleChange}
              required
            />
          </div>
          <div className="remember">
            <label>
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={e => setRememberMe(e.target.checked)}
              /> Remember Me
            </label>
          </div>
          <button className="login-button" type="submit" disabled={loading}>
            {loading ? 'Logging In…' : 'Login'}
          </button>
        </form>
      </div>
    </div>
  );
};

export default Login;