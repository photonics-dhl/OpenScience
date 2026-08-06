-- P1D-9：Author 表增加机构声明字段（§4.3 公开页必显信息）
ALTER TABLE authors ADD COLUMN affiliation TEXT;
