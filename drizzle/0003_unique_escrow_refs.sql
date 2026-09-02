UPDATE `agreements`
SET `version` = 2
WHERE `version` = 1
  AND `contract_address` IS NULL;
