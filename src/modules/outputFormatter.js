/**
 * Output Formatter Module
 * Formats compliance analysis into professional AI-readable output
 */

class OutputFormatter {
  /**
   * Format complete analysis into llms.txt output
   */
  formatCompliance(data) {
    let output = '';

    // Header with title
    output += this.formatHeader(data);

    // AI Readiness Score (prominent)
    output += this.formatScoreSection(data);

    // Site Overview
    output += this.formatSiteOverview(data);

    // AI Usage Guidelines
    output += this.formatAIGuidelines(data);

    // Content Sections by Category
    output += this.formatPageSections(data);

    // Sitemap section
    if (data.hasSitemap) {
      output += this.formatSitemapSection(data);
    }

    // Restricted pages (in HTML comment)
    if (data.classifiedPages && data.classifiedPages.restricted && data.classifiedPages.restricted.length > 0) {
      output += this.formatRestrictedPages(data);
    }

    // Metadata footer
    output += this.formatMetadataFooter(data);

    return output;
  }

  /**
   * Format header section
   */
  formatHeader(data) {
    const metadata = data.metadata || {};
    let header = `# ${metadata.title || 'AI Compliance & LLM Visibility'}  \n\n`;

    if (metadata.description) {
      header += `> ${metadata.description}\n\n`;
    }

    header += `**Website:** [${data.baseUrl}](${data.baseUrl})\n`;
    header += `**Content Type:** ${data.contentType || 'General'}\n`;
    if (metadata.language && metadata.language !== 'unknown') {
      header += `**Language:** ${metadata.language}\n`;
    }
    header += '\n';

    return header;
  }

  /**
   * Format AI Readiness Score section
   */
  formatScoreSection(data) {
    if (!data.scoreData) return '';

    const score = data.scoreData.score;
    const grade = data.scoreData.grade;
    const interpretation = this.getInterpretation(score);

    let section = `## AI Readiness Score\n\n`;
    section += `**Score:** ${score}/100 | **Grade:** ${grade}  \n`;
    section += `${score >= 80 ? '✅' : '⚠️'} ${interpretation}\n\n`;

    // Score breakdown
    section += `### Scoring Breakdown\n\n`;
    Object.entries(data.scoreData.breakdown).forEach(([category, score]) => {
      const weight = data.scoreData.weights[category];
      section += `- **${this.capitalizeFirst(category)}:** ${score}/10 (${weight}%)\n`;
    });

    section += '\n';
    return section;
  }

  /**
   * Format Site Overview section
   */
  formatSiteOverview(data) {
    const metadata = data.metadata || {};
    const classified = data.classifiedPages || {};

    let section = `## Site Overview\n\n`;

    // Content breakdown
    section += `**Content Summary:**\n`;
    section += `- Primary Content: ${classified.primary ? classified.primary.length : 0} pages\n`;
    if (classified.informational && classified.informational.length > 0) {
      section += `- Company Information: ${classified.informational.length} pages\n`;
    }
    if (classified.legal && classified.legal.length > 0) {
      section += `- Legal Pages: ${classified.legal.length} pages\n`;
    }
    if (classified.monetization && classified.monetization.length > 0) {
      section += `- Pricing & Plans: ${classified.monetization.length} pages\n`;
    }

    section += `\n**Website Attributes:**\n`;
    if (metadata.language && metadata.language !== 'unknown') {
      section += `- Primary Language: ${metadata.language}\n`;
    }
    section += `- Content Type: ${data.contentType || 'General'}\n`;
    if (data.hasSitemap) section += `- Sitemap: ✅ Available\n`;
    if (data.hasRobots) section += `- Robots.txt: ✅ Available\n`;
    if (metadata.schemaMarkup && metadata.schemaMarkup.types) {
      const validTypes = Object.entries(metadata.schemaMarkup.types)
        .filter(([t, info]) => info.valid)
        .map(([t]) => t);
      if (validTypes.length > 0) {
        section += `- Schema Markup: ✅ Present (${validTypes.join(', ')})\n`;
      } else {
        section += `- Schema Markup: Detected but incomplete/invalid\n`;
      }
    }

    section += '\n';
    return section;
  }

  /**
   * Format AI Guidelines section
   */
  formatAIGuidelines(data) {
    const policy = data.policy || {};

    let section = `## AI Usage Guidelines\n\n`;
    section += `This website provides the following permissions and restrictions for AI systems:\n\n`;

    const items = [
      { key: 'Allow-Summary', label: 'Content Summarization' },
      { key: 'Allow-Quotation', label: 'Direct Quotations' },
      { key: 'Allow-Training', label: 'Training Usage' },
      { key: 'Allow-Embedding', label: 'Embeddings' },
      { key: 'Require-Attribution', label: 'Attribution Required' }
    ];

    items.forEach(item => {
      section += `- **${item.label}:** ${policy[item.key] || 'Not specified'}\n`;
    });

    if (policy['Attribution-Format']) {
      section += `\n**Attribution Format:** ${policy['Attribution-Format']}\n`;
    }

    section += `**Policy Updated:** ${policy['Last-Updated'] || 'Unknown'}\n\n`;

    // Include permissions/risk if available
    if (data.permissions) {
      section += `**Risk Classification:** ${data.permissions.risk_label} (${(data.permissions.risk_score*100).toFixed(0)}%)\n`;
      section += `**Require Attribution:** ${data.permissions.require_attribution ? 'Yes' : 'No'}\n`;
      section += `**Allow Training:** ${data.permissions.allow_training ? 'Yes' : 'No'}\n`;
      section += `**Allow Embedding:** ${data.permissions.allow_embedding ? 'Yes' : 'No'}\n`;
      if (data.permissions.rationale && data.permissions.rationale.length > 0) {
        section += `\n**Permissions Rationale:**\n`;
        data.permissions.rationale.forEach(r => { section += `- ${r}\n`; });
      }
      section += '\n';
    }

    return section;
  }

  /**
   * Format page sections by category
   */
  formatPageSections(data) {
    const classified = data.classifiedPages || {};
    const categoryDisplay = {
      primary: 'Primary Content',
      informational: 'Company Information',
      legal: 'Legal Pages',
      monetization: 'Pricing & Plans'
    };

    let output = '';

    Object.entries(categoryDisplay).forEach(([category, display]) => {
      const pages = classified[category] || [];
      if (pages.length === 0) return;

      output += `## ${display}\n\n`;
      pages.forEach(page => {
        const title = page.title || this.extractTitleFromUrl(page.url);
        output += `- [${title}](${page.url})`;
        
        // Add description if meaningful
        if (page.description && page.description.trim().length > 10) {
          const desc = this.cleanDescription(page.description);
          if (desc) {
            output += `: ${desc}`;
          }
        }
        
        output += '\n';
      });

      output += '\n';
    });

    return output;
  }

  /**
   * Format Sitemap section
   */
  formatSitemapSection(data) {
    const sitemapUrl = new URL('/sitemap.xml', data.baseUrl).toString();

    return `## Sitemap\n\n` +
           `This website publishes a comprehensive sitemap at [sitemap.xml](${sitemapUrl}).\n\n`;
  }

  /**
   * Format restricted pages (in comment)
   */
  formatRestrictedPages(data) {
    const restricted = data.classifiedPages.restricted || [];
    if (restricted.length === 0) return '';

    let output = `<!-- RESTRICTED PAGES (Excluded from indexing)\n\n`;

    restricted.forEach(page => {
      const title = page.title || this.extractTitleFromUrl(page.url);
      output += `- ${title}\n  ${page.url}\n`;
    });

    output += `\n-->\n\n`;
    return output;
  }

  /**
   * Format metadata footer
   */
  formatMetadataFooter(data) {
    const now = new Date();
    const totalPages = Object.values(data.classifiedPages || {})
      .reduce((sum, cat) => sum + cat.length, 0);

    let footer = `<!-- AI COMPLIANCE METADATA\n`;
    footer += `\n`;
    footer += `Generated: ${now.toISOString()}\n`;
    footer += `Version: llms.txt 1.0\n`;
    footer += `\n`;
    footer += `AI Readiness Score: ${data.scoreData?.score || 0}/100\n`;
    footer += `Total Pages Analyzed: ${totalPages}\n`;
    footer += `\n`;
    footer += `Authorization:\n`;
    footer += `- Allow-Summary: ${data.policy?.['Allow-Summary'] || 'Not specified'}\n`;
    footer += `- Allow-Quotation: ${data.policy?.['Allow-Quotation'] || 'Not specified'}\n`;
    footer += `- Allow-Training: ${data.policy?.['Allow-Training'] || 'Not specified'}\n`;
    footer += `- Allow-Embedding: ${data.policy?.['Allow-Embedding'] || 'Not specified'}\n`;
    footer += `- Require-Attribution: ${data.policy?.['Require-Attribution'] || 'Not specified'}\n`;
    footer += `\n`;
    footer += `Detection:\n`;
    footer += `- Sitemap: ${data.hasSitemap ? 'Present' : 'Not found'}\n`;
    footer += `- Robots.txt: ${data.hasRobots ? 'Present' : 'Not found'}\n`;
    const schemaTypes = data.metadata?.schemaMarkup?.types || {};
    footer += `- Schema Markup: ${Object.keys(schemaTypes).length > 0 ? Object.entries(schemaTypes).filter(([k,v])=>v.valid).map(([k])=>k).join(', ') || 'Detected (invalid)' : 'Not found'}\n`;
    // Validation summary
    if (data.validation) {
      footer += `- HTTPS: ${data.validation.https_ok ? 'OK' : 'Missing/Non-HTTPS'}\n`;
      footer += `- Canonical Coverage: ${Math.round((data.validation.canonicalCoverage || 0)*100)}%\n`;
      footer += `- Meta Description Coverage: ${Math.round((data.validation.metaDescriptionCoverage || 0)*100)}%\n`;
      footer += `- Formatting Score: ${data.validation.formattingScore || 0}/10\n`;
      if (data.validation.duplicateTitleCount) footer += `- Duplicate Titles: ${data.validation.duplicateTitleCount}\n`;
    }
    footer += `\n`;
    footer += `-->\n`;

    return footer;
  }

  /**
   * Get score interpretation text
   */
  getInterpretation(score) {
    if (score >= 90) return 'Excellent AI compliance - comprehensive policies in place';
    if (score >= 80) return 'Good AI readiness - minor gaps remain';
    if (score >= 70) return 'Fair AI readiness - improvements recommended';
    if (score >= 60) return 'Poor AI readiness - significant work needed';
    return 'Critical - immediate action required';
  }

  /**
   * Clean description text
   */
  cleanDescription(desc) {
    if (!desc) return '';

    const boilerplate = /^(learn more|read more|click here|home page|welcome|this page)/i;
    if (boilerplate.test(desc)) return '';

    desc = desc.replace(/^(learn more|read more|click here|go to|visit)[\s:]+/i, '');

    if (desc.length > 140) {
      desc = desc.substring(0, 137) + '...';
    }

    return desc.trim();
  }

  /**
   * Extract title from URL
   */
  extractTitleFromUrl(url) {
    try {
      const urlObj = new URL(url);
      const path = urlObj.pathname;
      const segments = path.split('/').filter(s => s);

      if (segments.length === 0) return 'Home';

      const last = segments[segments.length - 1];
      return last
        .replace(/[-_]/g, ' ')
        .split(' ')
        .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
        .join(' ')
        .substring(0, 60);
    } catch (e) {
      return 'Page';
    }
  }

  /**
   * Capitalize first letter
   */
  capitalizeFirst(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }
}

module.exports = new OutputFormatter();
