// services/promotion.service.js
const promoteStudent = async (studentId, newClassId, academicYearId) => {
  const transaction = await sequelize.transaction();

  try {
    // 1. Verify student passed all required subjects in final term
    const finalTerm = await Term.findOne({
      where: { isFinal: true },
      transaction,
    });

    const records = await AcademicRecord.findAll({
      where: {
        studentId,
        termId: finalTerm.id,
        academicYearId,
      },
      transaction,
    });

    const failedSubjects = records.filter((r) => r.score < passingScore);
    if (failedSubjects.length > 0) {
      throw new Error(`Student failed ${failedSubjects.length} subjects`);
    }

    // 2. Update student's class
    await Student.update(
      { currentClassId: newClassId },
      { where: { id: studentId }, transaction }
    );

    // 3. Mark promotion in all records
    await AcademicRecord.update(
      { isPromoted: true },
      {
        where: {
          studentId,
          academicYearId,
        },
        transaction,
      }
    );

    await transaction.commit();
    return { success: true };
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
};
