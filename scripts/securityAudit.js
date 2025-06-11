#!/usr/bin/env node

/**
 * Скрипт аудита безопасности для Telegram бота
 * Проверяет конфигурацию, токены, зависимости и настройки безопасности
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

class SecurityAuditor {
  constructor() {
    this.issues = [];
    this.warnings = [];
    this.recommendations = [];
    this.score = 100;
  }

  /**
   * Запуск полного аудита безопасности
   */
  async runAudit() {
    console.log('🔍 Запуск аудита безопасности...\n');

    // Проверки
    this.checkEnvironmentVariables();
    this.checkFilePermissions();
    this.checkTokenSecurity();
    this.checkDependencies();
    this.checkConfigurationFiles();
    this.checkSecurityMiddleware();
    this.checkLoggingConfiguration();

    // Результаты
    this.generateReport();
  }

  /**
   * Проверка переменных окружения
   */
  checkEnvironmentVariables() {
    console.log('📋 Проверка переменных окружения...');

    const requiredVars = [
      'BOT_TOKEN',
      'SESSION_SECRET',
      'JWT_SECRET'
    ];

    const recommendedVars = [
      'WEBHOOK_SECRET',
      'WEBHOOK_URL',
      'NODE_ENV',
      'RATE_LIMIT_MAX_REQUESTS',
      'ENABLE_RATE_LIMITING'
    ];

    // Проверяем .env файл
    const envPath = path.join(process.cwd(), '.env');
    const envExamplePath = path.join(process.cwd(), 'env.example');

    if (!fs.existsSync(envPath)) {
      this.addIssue('CRITICAL', '.env файл не найден');
      this.score -= 20;
    }

    if (!fs.existsSync(envExamplePath)) {
      this.addWarning('env.example файл не найден');
      this.score -= 5;
    }

    // Загружаем переменные окружения
    if (fs.existsSync(envPath)) {
      const envContent = fs.readFileSync(envPath, 'utf8');
      const envVars = this.parseEnvFile(envContent);

      // Проверяем обязательные переменные
      for (const varName of requiredVars) {
        if (!envVars[varName]) {
          this.addIssue('HIGH', `Отсутствует обязательная переменная: ${varName}`);
          this.score -= 15;
        } else {
          this.checkVariableSecurity(varName, envVars[varName]);
        }
      }

      // Проверяем рекомендуемые переменные
      for (const varName of recommendedVars) {
        if (!envVars[varName]) {
          this.addWarning(`Рекомендуется установить переменную: ${varName}`);
          this.score -= 2;
        }
      }

      // Проверяем NODE_ENV
      if (envVars.NODE_ENV === 'development') {
        this.addWarning('NODE_ENV установлен в development режим');
      }
    }

    console.log('✅ Проверка переменных окружения завершена\n');
  }

  /**
   * Проверка безопасности конкретной переменной
   */
  checkVariableSecurity(name, value) {
    switch (name) {
      case 'BOT_TOKEN':
        if (!this.validateBotToken(value)) {
          this.addIssue('HIGH', 'Неверный формат BOT_TOKEN');
          this.score -= 10;
        }
        break;

      case 'SESSION_SECRET':
      case 'JWT_SECRET':
        if (value.length < 16) {
          this.addIssue('MEDIUM', `${name} слишком короткий (минимум 16 символов)`);
          this.score -= 8;
        }
        if (value === 'your_secret_here' || value === 'changeme') {
          this.addIssue('CRITICAL', `${name} использует значение по умолчанию`);
          this.score -= 20;
        }
        break;

      case 'WEBHOOK_SECRET':
        if (value && value.length < 8) {
          this.addIssue('MEDIUM', 'WEBHOOK_SECRET слишком короткий');
          this.score -= 5;
        }
        break;
    }
  }

  /**
   * Проверка прав доступа к файлам
   */
  checkFilePermissions() {
    console.log('🔒 Проверка прав доступа к файлам...');

    const sensitiveFiles = [
      '.env',
      'sessions.json',
      'orders.db',
      'package.json'
    ];

    for (const file of sensitiveFiles) {
      const filePath = path.join(process.cwd(), file);
      
      if (fs.existsSync(filePath)) {
        try {
          const stats = fs.statSync(filePath);
          const mode = stats.mode & parseInt('777', 8);
          
          // Проверяем, что файл не доступен для записи другим пользователям
          if (mode & parseInt('022', 8)) {
            this.addWarning(`Файл ${file} доступен для записи другим пользователям`);
            this.score -= 3;
          }
        } catch (error) {
          this.addWarning(`Не удалось проверить права доступа к файлу ${file}`);
        }
      }
    }

    console.log('✅ Проверка прав доступа завершена\n');
  }

  /**
   * Проверка безопасности токенов
   */
  checkTokenSecurity() {
    console.log('🔑 Проверка безопасности токенов...');

    // Проверяем, не содержатся ли токены в коде
    const codeFiles = this.findCodeFiles();
    const tokenPatterns = [
      /\d{8,10}:[A-Za-z0-9_-]{35}/g, // Bot token pattern
      /sk_[a-zA-Z0-9]{24,}/g,        // API key pattern
      /[A-Za-z0-9]{32,}/g            // Generic secret pattern
    ];

    for (const file of codeFiles) {
      const content = fs.readFileSync(file, 'utf8');
      
      for (const pattern of tokenPatterns) {
        const matches = content.match(pattern);
        if (matches) {
          this.addIssue('CRITICAL', `Возможный токен найден в файле ${file}`);
          this.score -= 25;
        }
      }
    }

    console.log('✅ Проверка токенов завершена\n');
  }

  /**
   * Проверка зависимостей
   */
  checkDependencies() {
    console.log('📦 Проверка зависимостей...');

    const packageJsonPath = path.join(process.cwd(), 'package.json');
    
    if (fs.existsSync(packageJsonPath)) {
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
      
      // Проверяем наличие security-related пакетов
      const securityPackages = [
        'dotenv',
        'helmet',
        'express-rate-limit',
        'validator'
      ];

      const dependencies = {
        ...packageJson.dependencies,
        ...packageJson.devDependencies
      };

      // Проверяем устаревшие пакеты
      const outdatedPatterns = [
        { name: 'node', version: '14', message: 'Используйте Node.js 16+' },
        { name: 'telegraf', version: '3', message: 'Обновите Telegraf до версии 4+' }
      ];

      for (const pkg of outdatedPatterns) {
        if (dependencies[pkg.name] && dependencies[pkg.name].includes(pkg.version)) {
          this.addWarning(pkg.message);
          this.score -= 5;
        }
      }

      // Проверяем наличие security пакетов
      if (!dependencies.dotenv) {
        this.addRecommendation('Установите пакет dotenv для управления переменными окружения');
      }
    }

    console.log('✅ Проверка зависимостей завершена\n');
  }

  /**
   * Проверка конфигурационных файлов
   */
  checkConfigurationFiles() {
    console.log('⚙️ Проверка конфигурационных файлов...');

    // Проверяем наличие security конфигурации
    const securityConfigPath = path.join(process.cwd(), 'src/config/security.ts');
    if (!fs.existsSync(securityConfigPath)) {
      this.addIssue('MEDIUM', 'Отсутствует файл конфигурации безопасности');
      this.score -= 10;
    }

    // Проверяем .gitignore
    const gitignorePath = path.join(process.cwd(), '.gitignore');
    if (fs.existsSync(gitignorePath)) {
      const gitignoreContent = fs.readFileSync(gitignorePath, 'utf8');
      
      const requiredIgnores = ['.env', 'sessions.json', '*.log', 'node_modules'];
      
      for (const ignore of requiredIgnores) {
        if (!gitignoreContent.includes(ignore)) {
          this.addWarning(`Добавьте ${ignore} в .gitignore`);
          this.score -= 2;
        }
      }
    } else {
      this.addIssue('MEDIUM', 'Отсутствует .gitignore файл');
      this.score -= 8;
    }

    console.log('✅ Проверка конфигурации завершена\n');
  }

  /**
   * Проверка middleware безопасности
   */
  checkSecurityMiddleware() {
    console.log('🛡️ Проверка middleware безопасности...');

    const middlewareFiles = [
      'src/middlewares/rateLimitMiddleware.ts',
      'src/middlewares/inputValidation.ts',
      'src/middlewares/webhookSecurity.ts'
    ];

    for (const file of middlewareFiles) {
      const filePath = path.join(process.cwd(), file);
      if (!fs.existsSync(filePath)) {
        this.addIssue('MEDIUM', `Отсутствует middleware: ${file}`);
        this.score -= 8;
      }
    }

    console.log('✅ Проверка middleware завершена\n');
  }

  /**
   * Проверка конфигурации логирования
   */
  checkLoggingConfiguration() {
    console.log('📝 Проверка конфигурации логирования...');

    // Проверяем наличие папки для логов
    const logsDir = path.join(process.cwd(), 'logs');
    if (!fs.existsSync(logsDir)) {
      this.addRecommendation('Создайте папку logs для хранения логов');
    }

    // Проверяем настройки логирования в .env
    const envPath = path.join(process.cwd(), '.env');
    if (fs.existsSync(envPath)) {
      const envContent = fs.readFileSync(envPath, 'utf8');
      const envVars = this.parseEnvFile(envContent);

      if (envVars.ENABLE_DEBUG_LOGGING === 'true' && envVars.NODE_ENV === 'production') {
        this.addIssue('MEDIUM', 'Debug логирование включено в production');
        this.score -= 5;
      }
    }

    console.log('✅ Проверка логирования завершена\n');
  }

  /**
   * Генерация отчета
   */
  generateReport() {
    console.log('📊 ОТЧЕТ ПО АУДИТУ БЕЗОПАСНОСТИ');
    console.log('='.repeat(50));
    
    // Общий счет
    const grade = this.getSecurityGrade(this.score);
    console.log(`\n🎯 Общая оценка безопасности: ${this.score}/100 (${grade})`);
    
    // Критические проблемы
    if (this.issues.length > 0) {
      console.log('\n🚨 КРИТИЧЕСКИЕ ПРОБЛЕМЫ:');
      this.issues.forEach((issue, index) => {
        console.log(`${index + 1}. [${issue.level}] ${issue.message}`);
      });
    }

    // Предупреждения
    if (this.warnings.length > 0) {
      console.log('\n⚠️ ПРЕДУПРЕЖДЕНИЯ:');
      this.warnings.forEach((warning, index) => {
        console.log(`${index + 1}. ${warning}`);
      });
    }

    // Рекомендации
    if (this.recommendations.length > 0) {
      console.log('\n💡 РЕКОМЕНДАЦИИ:');
      this.recommendations.forEach((rec, index) => {
        console.log(`${index + 1}. ${rec}`);
      });
    }

    // Следующие шаги
    console.log('\n🔧 СЛЕДУЮЩИЕ ШАГИ:');
    if (this.score < 70) {
      console.log('1. Немедленно исправьте критические проблемы');
      console.log('2. Установите сильные пароли и секреты');
      console.log('3. Настройте переменные окружения');
    } else if (this.score < 90) {
      console.log('1. Исправьте предупреждения');
      console.log('2. Реализуйте рекомендации');
      console.log('3. Настройте мониторинг');
    } else {
      console.log('1. Поддерживайте текущий уровень безопасности');
      console.log('2. Регулярно обновляйте зависимости');
      console.log('3. Мониторьте логи безопасности');
    }

    console.log('\n' + '='.repeat(50));
    console.log('Аудит завершен!');
  }

  /**
   * Вспомогательные методы
   */
  addIssue(level, message) {
    this.issues.push({ level, message });
  }

  addWarning(message) {
    this.warnings.push(message);
  }

  addRecommendation(message) {
    this.recommendations.push(message);
  }

  parseEnvFile(content) {
    const vars = {};
    const lines = content.split('\n');
    
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        const [key, ...valueParts] = trimmed.split('=');
        if (key && valueParts.length > 0) {
          vars[key.trim()] = valueParts.join('=').trim();
        }
      }
    }
    
    return vars;
  }

  validateBotToken(token) {
    const tokenRegex = /^\d{8,10}:[A-Za-z0-9_-]{35}$/;
    return tokenRegex.test(token);
  }

  findCodeFiles() {
    const files = [];
    const extensions = ['.ts', '.js', '.json'];
    const excludeDirs = ['node_modules', '.git', 'dist', 'build'];

    const scanDir = (dir) => {
      const items = fs.readdirSync(dir);
      
      for (const item of items) {
        const fullPath = path.join(dir, item);
        const stat = fs.statSync(fullPath);
        
        if (stat.isDirectory() && !excludeDirs.includes(item)) {
          scanDir(fullPath);
        } else if (stat.isFile() && extensions.some(ext => item.endsWith(ext))) {
          files.push(fullPath);
        }
      }
    };

    scanDir(process.cwd());
    return files;
  }

  getSecurityGrade(score) {
    if (score >= 95) return 'A+';
    if (score >= 90) return 'A';
    if (score >= 85) return 'B+';
    if (score >= 80) return 'B';
    if (score >= 75) return 'C+';
    if (score >= 70) return 'C';
    if (score >= 60) return 'D';
    return 'F';
  }
}

// Запуск аудита
if (require.main === module) {
  const auditor = new SecurityAuditor();
  auditor.runAudit().catch(console.error);
}

module.exports = SecurityAuditor; 