-- Remove sample/fake university data that was accidentally loaded
-- These universities came from the generateOpsSampleData() function

DELETE FROM ops_instructor_daily WHERE university_name IN (
    'JNTU Hyderabad', 'Osmania University', 'OU Engg College', 'CBIT', 'MGIT',
    'VBIT', 'VNRVJIET', 'CVR College', 'CMR College', 'Malla Reddy',
    'SR Engineering', 'Vardhaman College', 'KITS Warangal', 'JNTUK Kakinada',
    'RGUKT Basar', 'Siddhartha Engg', 'KL University'
);

DELETE FROM ops_daily_data WHERE university_name IN (
    'JNTU Hyderabad', 'Osmania University', 'OU Engg College', 'CBIT', 'MGIT',
    'VBIT', 'VNRVJIET', 'CVR College', 'CMR College', 'Malla Reddy',
    'SR Engineering', 'Vardhaman College', 'KITS Warangal', 'JNTUK Kakinada',
    'RGUKT Basar', 'Siddhartha Engg', 'KL University'
);
