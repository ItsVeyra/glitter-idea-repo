/**
 * 灵感池领域模型定义。
 * 负责描述池实体的基础字段，供服务层、存储层与视图层共享。
 */
// 灵感池实体定义。
export interface Pool {
  id: string;
  name: string;
  description?: string;
  color?: string;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}
