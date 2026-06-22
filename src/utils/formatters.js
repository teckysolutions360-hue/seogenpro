exports.formatRobotsTxt = (rules) => {
  let output = '';
  
  rules.forEach(rule => {
    output += `${rule.directive}: ${rule.value}\n`;
  });
  
  return output;
};

exports.formatSitemapXml = (urls, options = {}) => {
  const {
    baseUrl = '',
    changeFrequency = 'weekly',
    priority = 0.5,
    lastMod = new Date().toISOString()
  } = options;

  let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
  xml += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';

  urls.forEach(url => {
    xml += '  <url>\n';
    xml += `    <loc>${escapeXml(url)}</loc>\n`;
    xml += `    <lastmod>${lastMod.split('T')[0]}</lastmod>\n`;
    xml += `    <changefreq>${changeFrequency}</changefreq>\n`;
    xml += `    <priority>${priority}</priority>\n`;
    xml += '  </url>\n';
  });

  xml += '</urlset>';
  return xml;
};

exports.formatLlmsTxt = (data) => {
  const {
    title,
    summary,
    sections = [],
    metadata = {}
  } = data;

  let output = `# ${title}\n\n`;
  output += `> ${summary}\n\n`;

  sections.forEach(section => {
    output += `## ${section.title}\n\n`;
    
    if (section.description) {
      output += `${section.description}\n\n`;
    }

    section.links.forEach(link => {
      output += `- [${link.title}](${link.url})`;
      if (link.description) {
        output += `: ${link.description}`;
      }
      output += '\n';
    });

    output += '\n';
  });

  if (Object.keys(metadata).length > 0) {
    output += '<!--\n';
    output += 'Metadata:\n';
    Object.entries(metadata).forEach(([key, value]) => {
      output += `${key}: ${value}\n`;
    });
    output += '-->\n';
  }

  return output;
};

function escapeXml(unsafe) {
  return unsafe.replace(/[<>&'"]/g, (c) => {
    switch (c) {
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '&': return '&amp;';
      case '\'': return '&apos;';
      case '"': return '&quot;';
      default: return c;
    }
  });
}