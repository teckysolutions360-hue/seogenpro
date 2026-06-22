/**
 * AI Policy Generator Module
 * Creates customizable AI usage policies for compliance
 */

class PolicyGenerator {
  /**
   * Generate AI usage policy
   */
  generatePolicy(options = {}) {
    const defaults = {
      allowSummary: true,
      allowQuotation: true,
      allowTraining: true,
      allowEmbedding: true,
      requireAttribution: true,
      attributionFormat: 'Please provide source URL and title',
      excludePrivateContent: true
    };

    const config = { ...defaults, ...options };

    return {
      'Allow-Summary': config.allowSummary ? 'Yes' : 'No',
      'Allow-Quotation': config.allowQuotation ? 'Yes' : 'No',
      'Allow-Training': config.allowTraining ? 'Yes' : 'No',
      'Allow-Embedding': config.allowEmbedding ? 'Yes' : 'No',
      'Require-Attribution': config.requireAttribution ? 'Yes' : 'No',
      'Attribution-Format': config.attributionFormat,
      'Last-Updated': new Date().toISOString().split('T')[0],
      'Exclude-Private': config.excludePrivateContent ? 'Yes' : 'No'
    };
  }

  /**
   * Generate policy explanation/rationale
   */
  generatePolicyRationale(policy) {
    const items = [];

    if (policy['Allow-Summary'] === 'Yes') {
      items.push('AI systems may create summaries and abstracts of this content');
    }

    if (policy['Allow-Quotation'] === 'Yes') {
      items.push('Direct quotations from this site are permitted in AI outputs');
    }

    if (policy['Allow-Training'] === 'Yes') {
      items.push('Content may be used for training machine learning models');
    }

    if (policy['Allow-Embedding'] === 'Yes') {
      items.push('Content embeddings and vector representations are allowed');
    }

    if (policy['Require-Attribution'] === 'Yes') {
      items.push(`Attribution required: ${policy['Attribution-Format']}`);
    }

    if (policy['Exclude-Private'] === 'Yes') {
      items.push('Private, restricted, and authenticated pages are excluded from AI usage');
    }

    return items;
  }

  /**
   * Validate policy completeness
   */
  validatePolicy(policy) {
    const required = [
      'Allow-Summary',
      'Allow-Quotation',
      'Allow-Training',
      'Allow-Embedding',
      'Require-Attribution',
      'Attribution-Format',
      'Last-Updated'
    ];

    const missing = required.filter(field => !policy[field]);
    const complete = missing.length === 0;

    return {
      complete,
      missing,
      score: ((required.length - missing.length) / required.length) * 100
    };
  }

  /**
   * Generate restrictive policy (data protection)
   */
  generateRestrictivePolicy() {
    return this.generatePolicy({
      allowSummary: false,
      allowQuotation: false,
      allowTraining: false,
      allowEmbedding: false,
      requireAttribution: true,
      attributionFormat: 'Source URL must be provided',
      excludePrivateContent: true
    });
  }

  /**
   * Generate permissive policy (open content)
   */
  generatePermissivePolicy() {
    return this.generatePolicy({
      allowSummary: true,
      allowQuotation: true,
      allowTraining: true,
      allowEmbedding: true,
      requireAttribution: true,
      attributionFormat: 'Link to original source recommended',
      excludePrivateContent: true
    });
  }

  /**
   * Generate balanced policy (default)
   */
  generateBalancedPolicy() {
    return this.generatePolicy({
      allowSummary: true,
      allowQuotation: true,
      allowTraining: true,
      allowEmbedding: true,
      requireAttribution: true,
      attributionFormat: 'Please provide source URL',
      excludePrivateContent: true
    });
  }

  /**
   * Create policy recommendations based on content type
   */
  generateRecommendations(contentType, currentPolicy) {
    const recommendations = [];

    if (contentType === 'legal' && currentPolicy['Allow-Training'] === 'Yes') {
      recommendations.push('Consider restricting AI training for sensitive legal content');
    }

    if (contentType === 'ecommerce' && currentPolicy['Allow-Summary'] === 'Yes') {
      recommendations.push('Product summaries by AI may affect your sales funnel');
    }

    if (contentType === 'saas' && currentPolicy['Allow-Training'] === 'Yes') {
      recommendations.push('Training data usage should be disclosed to compliance');
    }

    if (currentPolicy['Require-Attribution'] === 'No') {
      recommendations.push('Require attribution to maintain brand visibility in AI outputs');
    }

    if (currentPolicy['Allow-Embedding'] === 'No' && currentPolicy['Allow-Training'] === 'Yes') {
      recommendations.push('If allowing training, consider also allowing embeddings for consistency');
    }

    return recommendations;
  }

  /**
   * Format policy as markdown section
   */
  formatPolicyMarkdown(policy) {
    let markdown = `## AI Usage Guidelines\n\n`;
    markdown += `This website provides the following permissions and restrictions for AI systems:\n\n`;

    const items = [
      { key: 'Allow-Summary', label: 'Content Summarization' },
      { key: 'Allow-Quotation', label: 'Direct Quotations' },
      { key: 'Allow-Training', label: 'Training Data Usage' },
      { key: 'Allow-Embedding', label: 'Embedding Generation' },
      { key: 'Require-Attribution', label: 'Attribution Required' }
    ];

    items.forEach(item => {
      markdown += `- **${item.label}:** ${policy[item.key]}\n`;
    });

    markdown += `\n**Attribution Format:** ${policy['Attribution-Format']}\n`;
    markdown += `**Last Updated:** ${policy['Last-Updated']}\n`;

    if (policy['Exclude-Private'] === 'Yes') {
      markdown += `**Private Content:** Excluded from all AI usage\n`;
    }

    markdown += '\n';
    return markdown;
  }
}

module.exports = new PolicyGenerator();
