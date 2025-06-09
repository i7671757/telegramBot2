#!/usr/bin/env ts-node

import { analytics } from '../src/utils/analytics';
import { errorHandler } from '../src/utils/errorHandler';
import { apiCache, userCache, staticCache } from '../src/utils/cache';
import fs from 'fs';
import path from 'path';

interface ProjectAnalysis {
  timestamp: string;
  analytics: any;
  errors: any;
  cache: any;
  files: any;
  recommendations: string[];
}

class ProjectAnalyzer {
  
  async generateReport(): Promise<ProjectAnalysis> {
    console.log('🔍 Анализ проекта...');
    
    const analysis: ProjectAnalysis = {
      timestamp: new Date().toISOString(),
      analytics: await this.getAnalyticsData(),
      errors: this.getErrorMetrics(),
      cache: this.getCacheStats(),
      files: await this.getFileStats(),
      recommendations: this.generateRecommendations()
    };

    return analysis;
  }

  private async getAnalyticsData() {
    try {
      const metrics = await analytics.getMetrics(30);
      const topEvents = await analytics.getTopEvents(7);
      const hourlyStats = await analytics.getHourlyStats(7);

      return {
        metrics,
        topEvents,
        hourlyStats,
        status: 'success'
      };
    } catch (error) {
      return {
        status: 'error',
        message: 'Analytics not available'
      };
    }
  }

  private getErrorMetrics() {
    try {
      return {
        metrics: errorHandler.getMetrics(),
        status: 'success'
      };
    } catch (error) {
      return {
        status: 'error',
        message: 'Error metrics not available'
      };
    }
  }

  private getCacheStats() {
    return {
      api: apiCache.getStats(),
      user: userCache.getStats(),
      static: staticCache.getStats()
    };
  }

  private async getFileStats() {
    const projectRoot = process.cwd();
    const stats = {
      totalFiles: 0,
      totalSize: 0,
      typeBreakdown: {} as Record<string, number>,
      largestFiles: [] as Array<{ file: string; size: number }>
    };

    const scanDirectory = (dir: string) => {
      const files = fs.readdirSync(dir);
      
      for (const file of files) {
        const filePath = path.join(dir, file);
        const stat = fs.statSync(filePath);
        
        if (stat.isDirectory()) {
          if (!file.startsWith('.') && file !== 'node_modules') {
            scanDirectory(filePath);
          }
        } else {
          stats.totalFiles++;
          stats.totalSize += stat.size;
          
          const ext = path.extname(file);
          stats.typeBreakdown[ext] = (stats.typeBreakdown[ext] || 0) + 1;
          
          stats.largestFiles.push({
            file: path.relative(projectRoot, filePath),
            size: stat.size
          });
        }
      }
    };

    scanDirectory(projectRoot);
    
    // Сортируем по размеру и берем топ 10
    stats.largestFiles = stats.largestFiles
      .sort((a, b) => b.size - a.size)
      .slice(0, 10);

    return stats;
  }

  private generateRecommendations(): string[] {
    const recommendations: string[] = [];

    // Проверяем наличие .env файла
    if (!fs.existsSync('.env')) {
      recommendations.push('Создайте .env файл на основе .env.example');
    }

    // Проверяем размер файлов сессий
    try {
      const sessionsSize = fs.statSync('sessions.json').size;
      if (sessionsSize > 1024 * 1024) { // 1MB
        recommendations.push('Файл sessions.json слишком большой, рассмотрите оптимизацию');
      }
    } catch (error) {
      // Файл не существует
    }

    // Проверяем наличие логов
    if (!fs.existsSync('logs')) {
      recommendations.push('Папка logs не создана, логирование может не работать');
    }

    // Проверяем package.json
    try {
      const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
      
      if (!packageJson.scripts?.dev) {
        recommendations.push('Добавьте скрипт dev в package.json');
      }
      
      if (!packageJson.scripts?.build) {
        recommendations.push('Добавьте скрипт build в package.json');
      }
    } catch (error) {
      recommendations.push('Проблема с чтением package.json');
    }

    return recommendations;
  }

  async saveReport(analysis: ProjectAnalysis): Promise<void> {
    const reportsDir = 'reports';
    if (!fs.existsSync(reportsDir)) {
      fs.mkdirSync(reportsDir);
    }

    const filename = `analysis-${new Date().toISOString().split('T')[0]}.json`;
    const filepath = path.join(reportsDir, filename);
    
    fs.writeFileSync(filepath, JSON.stringify(analysis, null, 2));
    console.log(`📊 Отчет сохранен: ${filepath}`);
  }

  printSummary(analysis: ProjectAnalysis): void {
    console.log('\n📊 СВОДКА АНАЛИЗА ПРОЕКТА\n');
    console.log('=' .repeat(50));
    
    // Аналитика
    if (analysis.analytics.status === 'success') {
      const metrics = analysis.analytics.metrics;
      console.log(`👥 Всего пользователей: ${metrics.totalUsers}`);
      console.log(`📈 Активные пользователи (месяц): ${metrics.activeUsers.monthly}`);
      console.log(`📦 Всего заказов: ${metrics.orders.total}`);
      console.log(`✅ Выполненных заказов: ${metrics.orders.completed}`);
      console.log(`💰 Средний чек: ${metrics.orders.averageValue.toFixed(0)} сум`);
      console.log(`📊 Конверсия: ${metrics.conversionRate.toFixed(1)}%`);
    } else {
      console.log('❌ Аналитика недоступна');
    }

    console.log('\n' + '-'.repeat(50));

    // Ошибки
    if (analysis.errors.status === 'success') {
      const errorMetrics = analysis.errors.metrics;
      console.log(`🚨 Всего ошибок: ${errorMetrics.totalErrors}`);
      console.log(`📉 Процент ошибок: ${(errorMetrics.totalErrors / 1000 * 100).toFixed(2)}%`);
    } else {
      console.log('❌ Метрики ошибок недоступны');
    }

    console.log('\n' + '-'.repeat(50));

    // Кэш
    console.log('💾 СТАТИСТИКА КЭША:');
    console.log(`API кэш: ${analysis.cache.api.active} активных записей`);
    console.log(`Пользовательский кэш: ${analysis.cache.user.active} активных записей`);
    console.log(`Статический кэш: ${analysis.cache.static.active} активных записей`);

    console.log('\n' + '-'.repeat(50));

    // Файлы
    console.log('📁 СТАТИСТИКА ФАЙЛОВ:');
    console.log(`Всего файлов: ${analysis.files.totalFiles}`);
    console.log(`Общий размер: ${(analysis.files.totalSize / 1024 / 1024).toFixed(2)} MB`);
    
    console.log('\nТипы файлов:');
    Object.entries(analysis.files.typeBreakdown)
      .sort(([,a], [,b]) => (b as number) - (a as number))
      .slice(0, 5)
      .forEach(([ext, count]) => {
        console.log(`  ${ext || 'без расширения'}: ${count}`);
      });

    console.log('\n' + '-'.repeat(50));

    // Рекомендации
    if (analysis.recommendations.length > 0) {
      console.log('💡 РЕКОМЕНДАЦИИ:');
      analysis.recommendations.forEach((rec, index) => {
        console.log(`${index + 1}. ${rec}`);
      });
    } else {
      console.log('✅ Рекомендаций нет - проект в хорошем состоянии!');
    }

    console.log('\n' + '='.repeat(50));
    console.log(`🕐 Анализ завершен: ${new Date().toLocaleString('ru-RU')}`);
  }
}

// Запуск анализа
async function main() {
  const analyzer = new ProjectAnalyzer();
  
  try {
    const analysis = await analyzer.generateReport();
    analyzer.printSummary(analysis);
    await analyzer.saveReport(analysis);
  } catch (error) {
    console.error('❌ Ошибка при анализе проекта:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
} 