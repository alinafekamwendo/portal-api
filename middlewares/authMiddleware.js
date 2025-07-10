const jwt = require("jsonwebtoken");

const authenticate = async (req, res, next) => {
  // Try to get token from Authorization header first
  let token =
    req.header("Authorization")?.split(" ")[1] ||
    req.header("accessToken") ||
    req.cookies?.accessToken;

  if (!token) {
    return res.status(401).json({
      error: "Authentication required",
      code: "MISSING_TOKEN",
    });
  }

  if (!token) {
    return res.status(401).json({ error: "Authentication required" });
  }

  try {
    // Verify the token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Attach the decoded user to the request object
    req.user = decoded;
    // Proceed to the next middleware or route handler
    next();
  } catch (error) {
    if (error.name === "TokenExpiredError") {
      return res.status(401).json({ error: "Token expired" });
    }
    return res.status(403).json({ error: "Invalid token" });
  }
};

const authorize = (roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        error: `Access denied. Accessible to: ${roles.join(", ")} only`,
      });
    }
    next();
  };
};

// New middleware for refresh token validation
const validateRefreshToken = async (req, res, next) => {
  const refreshToken = req.cookies?.refreshToken;

  if (!refreshToken) {
    return res.status(401).json({ error: "Refresh token required" });
  }

  try {
    const decoded = jwt.verify(refreshToken, process.env.REFRESH_TOKEN_SECRET);

    // Check if refresh token exists in database (optional but recommended)
    const user = await User.findOne({
      where: { id: decoded.id },
      attributes: ["id"],
    });

    if (!user) {
      return res.status(403).json({ error: "Invalid refresh token" });
    }

    req.user = decoded;
    next();
  } catch (error) {
    if (error.name === "TokenExpiredError") {
      return res.status(403).json({ error: "Refresh token expired" });
    }
    return res.status(403).json({ error: "Invalid refresh token" });
  }
};

module.exports = { authenticate, authorize, validateRefreshToken };

// const jwt = require("jsonwebtoken");

// const authenticate = (req, res, next) => {
//   const token = req.header("accessToken");

//   if (!token) {
//     return res.status(401).json({ error: "Log in first !" });
//   }

//   try {
//     // Verify the token
//     const decoded = jwt.verify(token, process.env.JWT_SECRET);

//     // Attach the decoded user to the request object
//     req.user = decoded;

//     // Proceed to the next middleware or route handler
//     next();
//   } catch (error) {
//     res.status(400).json({ error: "Invalid token." });
//   }
// };

// const authorize = (roles) => {
//   return (req, res, next) => {
//     // Check if the user's role is included in the allowed roles
//     if (!roles.includes(req.user.role)) {
//       return res.status(403).json({
//         error: `Access denied.Accessible to: ${roles.join(", ")} only`,
//       });
//     }

//     // Proceed to the next middleware or route handler
//     next();
//   };
// };

// module.exports = { authenticate, authorize };
