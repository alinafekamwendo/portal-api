// backend/controllers/markingController.js

const { Op } = require('sequelize'); // Import Op for Sequelize operators
const ExcelJS = require('exceljs'); // For creating and reading Excel files
const asyncHandler = require("../middlewares/asyncHandler");
// Ensure these imports match your actual model names and paths
const { Student, Assessment, StudentAssessmentScore, User, Class, Term, Subject, SchoolYear, AssessmentType } = require('../models');


// --- Helper function to set cell protection and validation ---
const setProtectedCell = (cell, value, isEditable = false, validation = null) => {
    cell.value = value;
    cell.protection = {
        locked: !isEditable, // Lock if not editable
    };
    if (validation) {
        cell.dataValidation = validation;
    }
};


// --- API to Generate Marking Template ---
const generateMarkingTemplate = asyncHandler(async (req, res) => {
    const { assessmentId } = req.params;

    if (!assessmentId) {
        return res.status(400).json({ error: "Assessment ID is required." });
    }

    try {
        const assessment = await Assessment.findByPk(assessmentId, {
            include: [
                {
                    model: Class,
                    as: 'class',
                    attributes: ['id', 'name']
                },
                {
                    model: Term, as: 'term',
                    attributes: ['id', 'tname']
                },
                {
                    model: Subject,
                    as: 'subject',
                    attributes: ['id', 'name']
                },
                { model: SchoolYear, as: 'schoolYear', attributes: ['id', 'name'] },
                { model: AssessmentType, as: 'assessmentType', attributes: ['id', 'name', 'type'] },
            ]
        });

        if (!assessment) {
            return res.status(404).json({ error: "Assessment not found." });
        }

        // Fetch students in the class associated with this assessment
        const studentsInClass = await Student.findAll({
            where: { currentClassId: assessment.classId },
            include: [{ model: User, as: 'user', attributes: ['id', 'firstName', 'lastName', 'username'] }],
            order: [[{ model: User, as: 'user' }, 'firstName', 'ASC']], // Order students by name
        });

        if (studentsInClass.length === 0) {
            return res.status(404).json({ error: "No students found for this class and assessment." });
        }

        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Marking Template');

        // Define columns and their properties
        const columns = [
            { header: 'Student ID', key: 'studentId', width: 36 },
            { header: 'Student Name', key: 'studentName', width: 30 },
            { header: 'Class Name', key: 'className', width: 15 },
            { header: 'Term', key: 'termName', width: 15 },
            { header: 'School Year', key: 'schoolYearName', width: 15 },
            { header: 'Subject', key: 'subjectName', width: 20 },
            { header: 'Assessment Name', key: 'assessmentName', width: 30 },
            { header: 'Assessment Type', key: 'assessmentType', width: 20 },
            { header: 'Max Score', key: 'maxScore', width: 12 },
            { header: 'Score/Marks', key: 'score', width: 15 }, // This is the editable column
            { header: 'Remarks', key: 'remarks', width: 30 }, // Optional: for teacher comments
            { header: 'Assessment ID (DO NOT EDIT)', key: 'assessmentId', width: 40 }, // Hidden ID for import
        ];

        worksheet.columns = columns;

        // Apply header styling
        worksheet.getRow(1).eachCell((cell) => {
            cell.font = { bold: true, color: { argb: 'FFFFFFFF' } }; // White text
            cell.fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: 'FF4A90E2' } // Blue background
            };
            cell.alignment = { vertical: 'middle', horizontal: 'center' };
            cell.border = {
                top: { style: 'thin' }, left: { style: 'thin' },
                bottom: { style: 'thin' }, right: { style: 'thin' }
            };
        });

        // Populate data rows
        studentsInClass.forEach(student => {
            const rowData = {
                studentId: student.id,
                studentName: `${student.user.firstName} ${student.user.lastName}`,
                className: assessment.class?.name || 'N/A',
                termName: assessment.term?.tname || 'N/A',
                schoolYearName: assessment.schoolYear?.name || 'N/A',
                subjectName: assessment.subject?.name || 'N/A',
                assessmentName: assessment.title,
                assessmentType: assessment.assessmentType?.name || 'N/A',
                maxScore: assessment.maxScore,
                score: null, // Placeholder for score
                remarks: '', // Placeholder for remarks
                assessmentId: assessment.id, // Hidden assessment ID
            };
            worksheet.addRow(rowData);
        });

        // --- Sheet Protection and Data Validation ---
        // Protect the entire sheet first
        worksheet.protect(process.env.EXCEL_PASSWORD || '1517', {
            selectLockedCells: true,
            selectUnlockedCells: true,
            formatCells: true,
            formatColumns: true,
            formatRows: true,
            insertColumns: false,
            insertRows: false,
            insertHyperlinks: false,
            deleteColumns: false,
            deleteRows: false,
            sort: false,
            autoFilter: false,
            pivotTables: false,
            objects: false,
            scenarios: false,
        });

        // Unlock the 'Score/Marks' and 'Remarks' columns
        const scoreColumnIndex = columns.findIndex(col => col.key === 'score') + 1;
        const remarksColumnIndex = columns.findIndex(col => col.key === 'remarks') + 1;
        const assessmentIdColumnIndex = columns.findIndex(col => col.key === 'assessmentId') + 1;

        worksheet.columns.forEach((column, colIdx) => {
            if (colIdx + 1 === scoreColumnIndex || colIdx + 1 === remarksColumnIndex) {
                column.eachCell({ includeEmpty: true }, (cell) => {
                    cell.protection = { locked: false };
                });
            } else {
                // For other columns, ensure they are locked
                column.eachCell({ includeEmpty: true }, (cell) => {
                    cell.protection = { locked: true };
                });
            }
        });

        // Set data validation for the 'Score/Marks' column
        for (let i = 2; i <= worksheet.rowCount; i++) { // Start from row 2 (after header)
            worksheet.getCell(i, scoreColumnIndex).dataValidation = {
                type: 'whole',
                operator: 'between',
                allowBlank: true, // Allow blank if score is not yet entered
                formulae: [0, assessment.maxScore],
                showErrorMessage: true,
                errorStyle: 'error',
                errorTitle: 'Invalid Score',
                error: `Score must be a whole number between 0 and ${assessment.maxScore}.`,
            };
        }

        // Hide the 'Assessment ID' column
        worksheet.getColumn(assessmentIdColumnIndex).hidden = true;

        // Set response headers for Excel file download
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename=Marking_Template_${assessment.title.replace(/\s/g, '_')}.xlsx`);

        // Write workbook to buffer and send
        await workbook.xlsx.write(res);
        res.end();

    } catch (error) {
        console.error("Error generating marking template:", error);
        res.status(500).json({ error: "Failed to generate marking template." });
    }
});

// --- API to Import Marks ---
const importMarks = asyncHandler(async (req, res) => {
    // Multer middleware will put the file on req.file
    if (!req.file) {
        return res.status(400).json({ success: false, message: "No file uploaded." });
    }
    const { assessmentId } = req.body; // Assessment ID passed from frontend form data

    if (!assessmentId) {
        return res.status(400).json({ success: false, message: "Assessment ID is required for import." });
    }

    const workbook = new ExcelJS.Workbook();
    const buffer = req.file.buffer; // Multer stores file in buffer

    try {
        await workbook.xlsx.load(buffer);
        const worksheet = workbook.getWorksheet(1); // Assuming marks are in the first worksheet

        if (!worksheet) {
            return res.status(400).json({ success: false, message: "No worksheet found in the Excel file." });
        }

        // --- Fetch assessment details here, as it's needed for validation ---
        const assessment = await Assessment.findByPk(assessmentId);
        if (!assessment) {
            return res.status(404).json({ success: false, message: "Assessment not found for import validation." });
        }
        // --- END Fetch assessment details ---

        const importedMarks = [];
        const errors = [];
        let processedCount = 0;

        // Map column headers to expected keys (case-insensitive and trimmed)
        const headerRow = worksheet.getRow(1);
        const headerMap = {};
        headerRow.eachCell((cell, colNumber) => {
            headerMap[cell.value.toString().trim().toLowerCase()] = colNumber;
        });

        const studentIdCol = headerMap['student id'];
        const scoreCol = headerMap['score/marks'];
        const remarksCol = headerMap['remarks'];
        const assessmentIdCol = headerMap['assessment id (do not edit)']; // Hidden column

        if (!studentIdCol || !scoreCol || !assessmentIdCol) {
            return res.status(400).json({
                success: false,
                message: "Missing required columns in the Excel file: 'Student ID', 'Score/Marks', 'Assessment ID (DO NOT EDIT)'.",
            });
        }

        // Iterate over rows, skipping header (row 1)
        for (let i = 2; i <= worksheet.rowCount; i++) {
            const row = worksheet.getRow(i);
            const studentId = row.getCell(studentIdCol).value?.toString().trim();
            let score = row.getCell(scoreCol).value;
            const remarks = row.getCell(remarksCol).value?.toString().trim() || null;
            const rowAssessmentId = row.getCell(assessmentIdCol).value?.toString().trim();

            // Skip empty rows
            if (!studentId && (score === null || score === undefined || score === '') && !remarks) {
                continue;
            }

            // --- Server-side Validation for each row ---
            if (!studentId) {
                errors.push({ row: i, message: "Student ID is missing.", data: row.values });
                continue;
            }
            if (!rowAssessmentId || rowAssessmentId !== assessmentId) {
                 errors.push({ row: i, message: "Assessment ID mismatch or missing in row.", data: row.values });
                 continue;
            }

            // Validate score
            if (score !== null && score !== undefined && score !== '') {
                score = parseFloat(score);
                if (isNaN(score) || score < 0 || score > assessment.maxScore) { // 'assessment' is now defined
                    errors.push({ row: i, message: `Score must be a number between 0 and ${assessment.maxScore}.`, data: row.values });
                    continue;
                }
            } else {
                score = null; // Allow null/empty scores if not provided
            }

            // Check if student exists and belongs to the assessment's class
            const student = await Student.findOne({
                where: { id: studentId, currentClassId: assessment.classId }, // 'assessment.classId' is now defined
                attributes: ['id'],
            });

            if (!student) {
                errors.push({ row: i, message: `Student with ID ${studentId} not found or does not belong to this class.`, data: row.values });
                continue;
            }

            importedMarks.push({
                studentId: student.id,
                assessmentId: assessmentId,
                score: score,
                remarks: remarks,
            });
            processedCount++;
        }

        // --- Bulk Upsert into StudentAssessmentScore ---
        const transaction = await StudentAssessmentScore.sequelize.transaction();
        try {
            for (const mark of importedMarks) {
                await StudentAssessmentScore.upsert(mark, {
                    where: { studentId: mark.studentId, assessmentId: mark.assessmentId },
                    transaction,
                });
            }
            await transaction.commit();
        } catch (dbError) {
            await transaction.rollback();
            console.error("Database upsert error during import:", dbError);
            return res.status(500).json({ success: false, message: "Failed to save marks to database.", errors: errors.concat({ row: 'N/A', message: 'Database transaction failed.', data: dbError.message }) });
        }

        res.status(200).json({
            success: true,
            message: `Successfully processed ${processedCount} records.`,
            processedCount,
            errors,
        });

    } catch (error) {
        console.error("Error importing marks from Excel:", error);
        res.status(500).json({ success: false, message: "An unexpected error occurred during import.", errors: [{ row: 'N/A', message: error.message || 'Unknown error' }] });
    }
});


// Helper to get all students in a class (assuming Student is a User with role 'student')
// This helper is not directly used by importMarks, but keeping it for context.
const getStudentsInClass = async (classId) => {
    // This assumes you have a relationship between User and Class, e.g., through a 'StudentClass' join table
    // or a 'classId' column on the User model for students.
    // For simplicity, let's assume students have a `currentClassId` on the Student model.
    const students = await Student.findAll({ // Using Student model directly
        where: { currentClassId: classId }, // Filter by classId
        include: [{ model: User, as: 'user', attributes: ['id', 'firstName', 'lastName', 'username'] }], // Include User details
        attributes: ['id'], // Select student ID for the join
    });
    return students;
};


// Get assessments relevant for a teacher to mark
const getAssessmentsForMarking = asyncHandler(async (req, res) => {
    const { teacherId, subjectId, classId } = req.params;
    // Assuming a teacher is assigned to teach a specific subject to a specific class.
    // You might need a 'TeacherAssignment' model to link teachers to subjects and classes.
    // For this example, let's just fetch assessments for the given subject and class for the current academic year/term.

    // Fetch current academic year and term (You'll need a mechanism for this, e.g., from settings or a dedicated model)
    const currentAcademicYear = await SchoolYear.findOne({ where: { isCurrent: true } });
    const currentTerm = await Term.findOne({ where: { isCurrent: true } });

    if (!currentAcademicYear || !currentTerm) {
        return res.status(400).json({ error: "Current academic year or term not set." });
    }

    const assessments = await Assessment.findAll({
        where: {
            subjectId: subjectId,
            classId: classId, // Added classId filter
            academicYearId: currentAcademicYear.id,
            termId: currentTerm.id,
        },
        include: [
            { model: AssessmentType, as: 'assessmentType', attributes: ['name', 'weight'] },
            { model: Subject, as: 'subject', attributes: ['name'] }
        ],
        order: [['date', 'ASC']]
    });

    res.status(200).json(assessments);
});


// Get students and their scores for a specific assessment (for pre-filling/editing)
const getStudentScoresForAssessment = asyncHandler(async (req, res) => {
    const { assessmentId } = req.params;

    const assessment = await Assessment.findByPk(assessmentId);
    if (!assessment) {
        return res.status(404).json({ error: "Assessment not found." });
    }

    // Fetch students belonging to the class this assessment is for.
    const studentsInRelevantClass = await Student.findAll({
        where: { currentClassId: assessment.classId },
        include: [{ model: User, as: 'user', attributes: ['id', 'firstName', 'lastName', 'username'] }],
        order: [[{ model: User, as: 'user' }, 'firstName', 'ASC']],
    });

    const studentScores = await StudentAssessmentScore.findAll({
        where: { assessmentId: assessmentId, studentId: { [Op.in]: studentsInRelevantClass.map(s => s.id) } },
        raw: true, // Get plain data for easier merging
    });

    // Merge students with their scores for easy frontend consumption
    const data = studentsInRelevantClass.map(student => {
        const scoreEntry = studentScores.find(s => s.studentId === student.id);
        return {
            studentId: student.id,
            firstName: student.user.firstName, // Access through user alias
            lastName: student.user.lastName,   // Access through user alias
            score: scoreEntry ? scoreEntry.score : null,
            remarks: scoreEntry ? scoreEntry.remarks : null, // Use 'remarks' as per your template
            maxScore: assessment.maxScore // Useful for frontend validation
        };
    });

    res.status(200).json({ assessment, students: data });
});

// Submit/Update scores for multiple students for an assessment
const submitStudentScores = asyncHandler(async (req, res) => {
    const { assessmentId } = req.params;
    const { scores } = req.body; // scores is an array: [{ studentId, score, comment }]

    if (!Array.isArray(scores) || scores.length === 0) {
        return res.status(400).json({ error: "Scores array is required and cannot be empty." });
    }

    const assessment = await Assessment.findByPk(assessmentId);
    if (!assessment) {
        return res.status(404).json({ error: "Assessment not found." });
    }

    const transaction = await StudentAssessmentScore.sequelize.transaction();
    try {
        const results = [];
        for (const scoreEntry of scores) {
            const { studentId, score, remarks } = scoreEntry; // Use 'remarks'

            if (score === null || score === undefined || isNaN(score)) {
                // Allow null/undefined scores for students who didn't take the exam, or skip them
                // Depending on business logic, you might want to enforce score presence
                results.push({ studentId, status: 'skipped', message: 'Score is null/undefined' });
                continue;
            }

            if (score < 0 || score > assessment.maxScore) {
                await transaction.rollback();
                return res.status(400).json({ error: `Score for student ${studentId} must be between 0 and ${assessment.maxScore}.` });
            }

            const [studentScore, created] = await StudentAssessmentScore.findOrCreate({
                where: { studentId: studentId, assessmentId: assessmentId },
                defaults: { score: score, remarks: remarks || null }, // Use 'remarks'
                transaction,
            });

            if (!created) {
                await studentScore.update({ score: score, remarks: remarks || null }, { transaction }); // Use 'remarks'
                results.push({ studentId, status: 'updated' });
            } else {
                results.push({ studentId, status: 'created' });
            }
        }

        await transaction.commit();
        res.status(200).json({ message: "Scores submitted successfully.", results });

    } catch (error) {
        await transaction.rollback();
        console.error("Error submitting student scores:", error);
        res.status(500).json({ error: "Failed to submit student scores." });
    }
});

module.exports = {
    getAssessmentsForMarking,
    getStudentScoresForAssessment,
    submitStudentScores,
    generateMarkingTemplate,
    importMarks,
};
