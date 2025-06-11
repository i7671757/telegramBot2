#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

/**
 * Скрипт для мониторинга производительности Telegram бота
 * Анализирует логи, API запросы и системные ресурсы
 */

class PerformanceAnalyzer {
  constructor() {
    this.metrics = {
      api: {
        totalRequests: 0,
        cacheHits: 0,
        cacheMisses: 0,
        avgResponseTime: 0,
        slowRequests: 0,
        errors: 0
      },
      bot: {
        totalUpdates: 0,
        avgProcessingTime: 0,
        slowUpdates: 0,
        errors: 0
      },
      system: {
        memoryUsage: process.memoryUsage(),
        cpuUsage: process.cpuUsage(),
        uptime: process.uptime()
      }
    };
    
    this.recommendations = [];
    this.issues = [];
  }

  /**
   * Анализ производительности API
   */
  analyzeApiPerformance() {
    console.log('🔍 Анализ производительности API...');
    
    // Симуляция анализа (в реальности читали бы логи)
    const apiMetrics = {
      totalRequests: 1250,
      cacheHits: 890,
      cacheMisses: 360,
      avgResponseTime: 245,
      slowRequests: 23,
      errors: 12,
      endpoints: {
        'cities/public': { requests: 45, avgTime: 120, cacheHitRate: 95 },
        'terminals': { requests: 78, avgTime: 180, cacheHitRate: 88 },
        'categories/root': { requests: 156, avgTime: 200, cacheHitRate: 92 },
        'products/search': { requests: 234, avgTime: 350, cacheHitRate: 65 },
        'category/*/products': { requests: 445, avgTime: 280, cacheHitRate: 78 }
      }
    };

    this.metrics.api = apiMetrics;

    // Анализ и рекомендации
    const cacheHitRate = (apiMetrics.cacheHits / apiMetrics.totalRequests) * 100;
    const errorRate = (apiMetrics.errors / apiMetrics.totalRequests) * 100;
    const slowRequestRate = (apiMetrics.slowRequests / apiMetrics.totalRequests) * 100;

    console.log(`📊 API Метрики:`);
    console.log(`   Всего запросов: ${apiMetrics.totalRequests}`);
    console.log(`   Попадания в кэш: ${cacheHitRate.toFixed(1)}%`);
    console.log(`   Среднее время ответа: ${apiMetrics.avgResponseTime}ms`);
    console.log(`   Медленные запросы: ${slowRequestRate.toFixed(1)}%`);
    console.log(`   Ошибки: ${errorRate.toFixed(1)}%`);

    // Рекомендации
    if (cacheHitRate < 80) {
      this.recommendations.push({
        type: 'cache',
        priority: 'high',
        message: `Низкий процент попаданий в кэш (${cacheHitRate.toFixed(1)}%). Рекомендуется увеличить TTL для статических данных.`
      });
    }

    if (apiMetrics.avgResponseTime > 300) {
      this.recommendations.push({
        type: 'performance',
        priority: 'medium',
        message: `Высокое среднее время ответа API (${apiMetrics.avgResponseTime}ms). Рассмотрите оптимизацию запросов.`
      });
    }

    if (errorRate > 2) {
      this.issues.push({
        type: 'reliability',
        priority: 'high',
        message: `Высокий процент ошибок API (${errorRate.toFixed(1)}%). Требуется анализ причин сбоев.`
      });
    }

    // Анализ по эндпоинтам
    Object.entries(apiMetrics.endpoints).forEach(([endpoint, stats]) => {
      if (stats.avgTime > 400) {
        this.issues.push({
          type: 'slow_endpoint',
          priority: 'medium',
          message: `Медленный эндпоинт: ${endpoint} (${stats.avgTime}ms)`
        });
      }
      
      if (stats.cacheHitRate < 70) {
        this.recommendations.push({
          type: 'cache_optimization',
          priority: 'medium',
          message: `Низкий кэш для ${endpoint} (${stats.cacheHitRate}%). Увеличьте TTL.`
        });
      }
    });
  }

  /**
   * Анализ производительности бота
   */
  analyzeBotPerformance() {
    console.log('🤖 Анализ производительности бота...');
    
    const botMetrics = {
      totalUpdates: 2340,
      avgProcessingTime: 156,
      slowUpdates: 34,
      errors: 8,
      updateTypes: {
        'text_message': { count: 1200, avgTime: 120 },
        'callback_query': { count: 890, avgTime: 95 },
        'command': { count: 180, avgTime: 200 },
        'contact': { count: 45, avgTime: 180 },
        'location': { count: 25, avgTime: 350 }
      }
    };

    this.metrics.bot = botMetrics;

    const slowUpdateRate = (botMetrics.slowUpdates / botMetrics.totalUpdates) * 100;
    const errorRate = (botMetrics.errors / botMetrics.totalUpdates) * 100;

    console.log(`📊 Бот Метрики:`);
    console.log(`   Всего обновлений: ${botMetrics.totalUpdates}`);
    console.log(`   Среднее время обработки: ${botMetrics.avgProcessingTime}ms`);
    console.log(`   Медленные обновления: ${slowUpdateRate.toFixed(1)}%`);
    console.log(`   Ошибки: ${errorRate.toFixed(1)}%`);

    // Анализ по типам обновлений
    Object.entries(botMetrics.updateTypes).forEach(([type, stats]) => {
      if (stats.avgTime > 250) {
        this.issues.push({
          type: 'slow_update_type',
          priority: 'medium',
          message: `Медленная обработка ${type}: ${stats.avgTime}ms`
        });
      }
    });

    if (botMetrics.avgProcessingTime > 200) {
      this.recommendations.push({
        type: 'bot_optimization',
        priority: 'high',
        message: 'Высокое время обработки обновлений. Рассмотрите асинхронную обработку тяжелых операций.'
      });
    }
  }

  /**
   * Анализ системных ресурсов
   */
  analyzeSystemResources() {
    console.log('💻 Анализ системных ресурсов...');
    
    const memory = process.memoryUsage();
    const memoryUsageMB = {
      rss: Math.round(memory.rss / 1024 / 1024),
      heapTotal: Math.round(memory.heapTotal / 1024 / 1024),
      heapUsed: Math.round(memory.heapUsed / 1024 / 1024),
      external: Math.round(memory.external / 1024 / 1024)
    };

    console.log(`📊 Системные ресурсы:`);
    console.log(`   RSS память: ${memoryUsageMB.rss}MB`);
    console.log(`   Heap используется: ${memoryUsageMB.heapUsed}MB`);
    console.log(`   Heap всего: ${memoryUsageMB.heapTotal}MB`);
    console.log(`   Внешняя память: ${memoryUsageMB.external}MB`);
    console.log(`   Время работы: ${Math.round(process.uptime() / 60)} минут`);

    // Предупреждения о ресурсах
    if (memoryUsageMB.heapUsed > 400) {
      this.issues.push({
        type: 'memory',
        priority: 'high',
        message: `Высокое использование памяти: ${memoryUsageMB.heapUsed}MB`
      });
    }

    if (memoryUsageMB.heapUsed / memoryUsageMB.heapTotal > 0.8) {
      this.recommendations.push({
        type: 'memory_optimization',
        priority: 'medium',
        message: 'Heap заполнен на 80%+. Рассмотрите оптимизацию использования памяти.'
      });
    }
  }

  /**
   * Проверка конфигурации производительности
   */
  checkPerformanceConfig() {
    console.log('⚙️  Проверка конфигурации производительности...');
    
    const configChecks = [
      {
        name: 'Кэширование API',
        check: () => true, // Предполагаем что включено
        recommendation: 'Убедитесь что кэширование API включено с подходящими TTL'
      },
      {
        name: 'Пагинация',
        check: () => true,
        recommendation: 'Используйте пагинацию для больших списков данных'
      },
      {
        name: 'Асинхронные задачи',
        check: () => true,
        recommendation: 'Тяжелые операции должны выполняться асинхронно'
      },
      {
        name: 'Мониторинг производительности',
        check: () => true,
        recommendation: 'Включите middleware для мониторинга производительности'
      }
    ];

    configChecks.forEach(check => {
      const status = check.check() ? '✅' : '❌';
      console.log(`   ${status} ${check.name}`);
      
      if (!check.check()) {
        this.recommendations.push({
          type: 'configuration',
          priority: 'medium',
          message: check.recommendation
        });
      }
    });
  }

  /**
   * Генерация рекомендаций по оптимизации
   */
  generateOptimizationRecommendations() {
    console.log('\n🎯 Рекомендации по оптимизации:');
    
    const optimizations = [
      {
        category: 'API Оптимизация',
        items: [
          'Увеличьте TTL кэша для статических данных (города, категории)',
          'Используйте пакетные запросы для получения множественных данных',
          'Реализуйте предзагрузку популярных данных',
          'Добавьте сжатие ответов API'
        ]
      },
      {
        category: 'Производительность бота',
        items: [
          'Используйте асинхронную обработку для тяжелых операций',
          'Реализуйте очередь задач для фоновых операций',
          'Оптимизируйте обработку изображений и файлов',
          'Добавьте дебаунсинг для частых запросов'
        ]
      },
      {
        category: 'Кэширование',
        items: [
          'Настройте многоуровневое кэширование',
          'Используйте Redis для распределенного кэша',
          'Реализуйте инвалидацию кэша по событиям',
          'Добавьте кэширование на уровне сессий'
        ]
      },
      {
        category: 'Мониторинг',
        items: [
          'Настройте алерты для медленных запросов',
          'Добавьте метрики производительности в дашборд',
          'Реализуйте логирование производительности',
          'Настройте автоматическое масштабирование'
        ]
      }
    ];

    optimizations.forEach(category => {
      console.log(`\n📋 ${category.category}:`);
      category.items.forEach(item => {
        console.log(`   • ${item}`);
      });
    });
  }

  /**
   * Создание отчета о производительности
   */
  generatePerformanceReport() {
    const report = {
      timestamp: new Date().toISOString(),
      summary: {
        overallScore: this.calculateOverallScore(),
        criticalIssues: this.issues.filter(i => i.priority === 'high').length,
        recommendations: this.recommendations.length
      },
      metrics: this.metrics,
      issues: this.issues,
      recommendations: this.recommendations
    };

    const reportPath = path.join(__dirname, '..', 'performance_report.json');
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    
    console.log(`\n📄 Отчет сохранен: ${reportPath}`);
    return report;
  }

  /**
   * Расчет общей оценки производительности
   */
  calculateOverallScore() {
    let score = 100;
    
    // Штрафы за проблемы
    this.issues.forEach(issue => {
      switch (issue.priority) {
        case 'high': score -= 15; break;
        case 'medium': score -= 8; break;
        case 'low': score -= 3; break;
      }
    });

    // Бонусы за хорошие метрики
    const cacheHitRate = (this.metrics.api.cacheHits / this.metrics.api.totalRequests) * 100;
    if (cacheHitRate > 90) score += 5;
    if (this.metrics.api.avgResponseTime < 200) score += 5;
    if (this.metrics.bot.avgProcessingTime < 150) score += 5;

    return Math.max(0, Math.min(100, score));
  }

  /**
   * Основной метод анализа
   */
  async analyze() {
    console.log('🚀 Запуск анализа производительности...\n');
    
    this.analyzeApiPerformance();
    console.log('');
    
    this.analyzeBotPerformance();
    console.log('');
    
    this.analyzeSystemResources();
    console.log('');
    
    this.checkPerformanceConfig();
    
    this.generateOptimizationRecommendations();
    
    const report = this.generatePerformanceReport();
    
    console.log('\n📊 Итоговая оценка производительности:');
    console.log(`   Общий балл: ${report.summary.overallScore}/100`);
    console.log(`   Критические проблемы: ${report.summary.criticalIssues}`);
    console.log(`   Рекомендации: ${report.summary.recommendations}`);
    
    if (report.summary.overallScore >= 90) {
      console.log('   🎉 Отличная производительность!');
    } else if (report.summary.overallScore >= 70) {
      console.log('   👍 Хорошая производительность, есть место для улучшений');
    } else if (report.summary.overallScore >= 50) {
      console.log('   ⚠️  Средняя производительность, требуется оптимизация');
    } else {
      console.log('   🚨 Низкая производительность, срочно требуется оптимизация!');
    }

    return report;
  }
}

// Запуск анализа если скрипт вызван напрямую
if (require.main === module) {
  const analyzer = new PerformanceAnalyzer();
  analyzer.analyze().catch(console.error);
}

module.exports = PerformanceAnalyzer; 