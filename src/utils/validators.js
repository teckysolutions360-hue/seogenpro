const validator = require('validator');

exports.validateUrl = (url) => {
  return validator.isURL(url, {
    protocols: ['http', 'https'],
    require_protocol: true,
    require_valid_protocol: true
  });
};

exports.validateEmail = (email) => {
  return validator.isEmail(email);
};

exports.validateRobotsDirective = (directive) => {
  const validDirectives = ['user-agent', 'disallow', 'allow', 'sitemap', 'crawl-delay', 'host'];
  return validDirectives.includes(directive.toLowerCase());
};

exports.sanitizePath = (path) => {
  // Ensure path starts with /
  if (!path.startsWith('/')) {
    path = '/' + path;
  }
  // Remove any suspicious characters
  return validator.escape(path);
};