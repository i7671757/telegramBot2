import { logger } from '../utils/logger';

interface Task {
  id: string;
  name: string;
  priority: 'low' | 'medium' | 'high';
  retries: number;
  maxRetries: number;
  createdAt: number;
  lastAttempt?: number;
  error?: string;
  execute: () => Promise<any>;
}

interface TaskResult {
  id: string;
  success: boolean;
  result?: any;
  error?: string;
  executionTime: number;
}

export class AsyncTaskManager {
  private static instance: AsyncTaskManager;
  private taskQueue: Task[] = [];
  private runningTasks = new Map<string, Promise<any>>();
  private completedTasks: TaskResult[] = [];
  private isProcessing = false;
  private maxConcurrentTasks = 5;
  private stats = {
    totalTasks: 0,
    completedTasks: 0,
    failedTasks: 0,
    avgExecutionTime: 0
  };

  private constructor() {
    // Запускаем процессор задач
    this.processQueue();
  }

  static getInstance(): AsyncTaskManager {
    if (!AsyncTaskManager.instance) {
      AsyncTaskManager.instance = new AsyncTaskManager();
    }
    return AsyncTaskManager.instance;
  }

  /**
   * Добавление задачи в очередь
   */
  addTask(
    name: string,
    execute: () => Promise<any>,
    options: {
      priority?: 'low' | 'medium' | 'high';
      maxRetries?: number;
      id?: string;
    } = {}
  ): string {
    const task: Task = {
      id: options.id || this.generateTaskId(),
      name,
      priority: options.priority || 'medium',
      retries: 0,
      maxRetries: options.maxRetries || 3,
      createdAt: Date.now(),
      execute
    };

    this.taskQueue.push(task);
    this.sortTasksByPriority();
    this.stats.totalTasks++;

    logger.debug(`Task added to queue: ${task.name} (${task.id})`);
    
    // Запускаем обработку если не запущена
    if (!this.isProcessing) {
      this.processQueue();
    }

    return task.id;
  }

  /**
   * Добавление задачи с высоким приоритетом
   */
  addHighPriorityTask(
    name: string,
    execute: () => Promise<any>,
    options: { maxRetries?: number; id?: string } = {}
  ): string {
    return this.addTask(name, execute, { ...options, priority: 'high' });
  }

  /**
   * Добавление фоновой задачи (низкий приоритет)
   */
  addBackgroundTask(
    name: string,
    execute: () => Promise<any>,
    options: { maxRetries?: number; id?: string } = {}
  ): string {
    return this.addTask(name, execute, { ...options, priority: 'low' });
  }

  /**
   * Выполнение задачи немедленно (вне очереди)
   */
  async executeImmediately<T>(
    name: string,
    execute: () => Promise<T>
  ): Promise<T> {
    const startTime = Date.now();
    const taskId = this.generateTaskId();

    try {
      logger.debug(`Executing immediate task: ${name} (${taskId})`);
      const result = await execute();
      
      const executionTime = Date.now() - startTime;
      this.recordTaskResult({
        id: taskId,
        success: true,
        result,
        executionTime
      });

      return result;
    } catch (error: any) {
      const executionTime = Date.now() - startTime;
      this.recordTaskResult({
        id: taskId,
        success: false,
        error: error.message,
        executionTime
      });

      throw error;
    }
  }

  /**
   * Получение статуса задачи
   */
  getTaskStatus(taskId: string): 'queued' | 'running' | 'completed' | 'failed' | 'not_found' {
    // Проверяем в очереди
    if (this.taskQueue.some(task => task.id === taskId)) {
      return 'queued';
    }

    // Проверяем в выполняющихся
    if (this.runningTasks.has(taskId)) {
      return 'running';
    }

    // Проверяем в завершенных
    const completed = this.completedTasks.find(task => task.id === taskId);
    if (completed) {
      return completed.success ? 'completed' : 'failed';
    }

    return 'not_found';
  }

  /**
   * Получение результата задачи
   */
  getTaskResult(taskId: string): TaskResult | null {
    return this.completedTasks.find(task => task.id === taskId) || null;
  }

  /**
   * Отмена задачи
   */
  cancelTask(taskId: string): boolean {
    const taskIndex = this.taskQueue.findIndex(task => task.id === taskId);
    if (taskIndex !== -1) {
      this.taskQueue.splice(taskIndex, 1);
      logger.debug(`Task cancelled: ${taskId}`);
      return true;
    }

    return false;
  }

  /**
   * Очистка очереди
   */
  clearQueue(): void {
    const cancelledCount = this.taskQueue.length;
    this.taskQueue = [];
    logger.info(`Queue cleared: ${cancelledCount} tasks cancelled`);
  }

  /**
   * Получение статистики
   */
  getStats() {
    return {
      ...this.stats,
      queueSize: this.taskQueue.length,
      runningTasks: this.runningTasks.size,
      completedTasksCount: this.completedTasks.length,
      successRate: this.stats.totalTasks > 0 
        ? ((this.stats.completedTasks / this.stats.totalTasks) * 100).toFixed(2) + '%'
        : '0%'
    };
  }

  /**
   * Основной процессор очереди
   */
  private async processQueue(): Promise<void> {
    if (this.isProcessing) return;
    
    this.isProcessing = true;
    logger.debug('Task queue processing started');

    while (this.taskQueue.length > 0 || this.runningTasks.size > 0) {
      // Запускаем новые задачи если есть свободные слоты
      while (
        this.taskQueue.length > 0 && 
        this.runningTasks.size < this.maxConcurrentTasks
      ) {
        const task = this.taskQueue.shift()!;
        this.executeTask(task);
      }

      // Ждем немного перед следующей итерацией
      await this.delay(100);
    }

    this.isProcessing = false;
    logger.debug('Task queue processing finished');
  }

  /**
   * Выполнение отдельной задачи
   */
  private async executeTask(task: Task): Promise<void> {
    const startTime = Date.now();
    task.lastAttempt = startTime;

    logger.debug(`Executing task: ${task.name} (${task.id}), attempt ${task.retries + 1}`);

    const taskPromise = (async () => {
      try {
        const result = await task.execute();
        const executionTime = Date.now() - startTime;

        this.recordTaskResult({
          id: task.id,
          success: true,
          result,
          executionTime
        });

        logger.debug(`Task completed: ${task.name} (${task.id}) in ${executionTime}ms`);
      } catch (error: any) {
        const executionTime = Date.now() - startTime;
        task.retries++;
        task.error = error.message;

        logger.warn(`Task failed: ${task.name} (${task.id}), attempt ${task.retries}/${task.maxRetries}`, error);

        if (task.retries < task.maxRetries) {
          // Добавляем задачу обратно в очередь с задержкой
          setTimeout(() => {
            this.taskQueue.push(task);
            this.sortTasksByPriority();
          }, this.calculateRetryDelay(task.retries));
        } else {
          // Максимальное количество попыток исчерпано
          this.recordTaskResult({
            id: task.id,
            success: false,
            error: error.message,
            executionTime
          });

          logger.error(`Task failed permanently: ${task.name} (${task.id})`);
        }
      } finally {
        this.runningTasks.delete(task.id);
      }
    })();

    this.runningTasks.set(task.id, taskPromise);
  }

  /**
   * Сортировка задач по приоритету
   */
  private sortTasksByPriority(): void {
    const priorityOrder = { high: 3, medium: 2, low: 1 };
    
    this.taskQueue.sort((a, b) => {
      const priorityDiff = priorityOrder[b.priority] - priorityOrder[a.priority];
      if (priorityDiff !== 0) return priorityDiff;
      
      // При одинаковом приоритете сортируем по времени создания
      return a.createdAt - b.createdAt;
    });
  }

  /**
   * Запись результата задачи
   */
  private recordTaskResult(result: TaskResult): void {
    this.completedTasks.push(result);
    
    // Обновляем статистику
    if (result.success) {
      this.stats.completedTasks++;
    } else {
      this.stats.failedTasks++;
    }

    // Обновляем среднее время выполнения
    const totalTime = this.completedTasks.reduce((sum, task) => sum + task.executionTime, 0);
    this.stats.avgExecutionTime = totalTime / this.completedTasks.length;

    // Ограничиваем размер истории
    if (this.completedTasks.length > 1000) {
      this.completedTasks = this.completedTasks.slice(-500);
    }
  }

  /**
   * Расчет задержки для повторной попытки
   */
  private calculateRetryDelay(attempt: number): number {
    // Exponential backoff: 1s, 2s, 4s, 8s...
    return Math.min(1000 * Math.pow(2, attempt - 1), 30000);
  }

  /**
   * Генерация ID задачи
   */
  private generateTaskId(): string {
    return `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Утилита для задержки
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Настройка максимального количества одновременных задач
   */
  setMaxConcurrentTasks(max: number): void {
    this.maxConcurrentTasks = Math.max(1, Math.min(max, 20));
    logger.info(`Max concurrent tasks set to: ${this.maxConcurrentTasks}`);
  }

  /**
   * Получение информации о текущем состоянии
   */
  getQueueInfo() {
    const queueByPriority = {
      high: this.taskQueue.filter(t => t.priority === 'high').length,
      medium: this.taskQueue.filter(t => t.priority === 'medium').length,
      low: this.taskQueue.filter(t => t.priority === 'low').length
    };

    return {
      isProcessing: this.isProcessing,
      queueSize: this.taskQueue.length,
      runningTasks: this.runningTasks.size,
      maxConcurrentTasks: this.maxConcurrentTasks,
      queueByPriority,
      oldestTaskAge: this.taskQueue.length > 0 
        ? Date.now() - Math.min(...this.taskQueue.map(t => t.createdAt))
        : 0
    };
  }
}

// Создаем единственный экземпляр
export const asyncTaskManager = AsyncTaskManager.getInstance(); 