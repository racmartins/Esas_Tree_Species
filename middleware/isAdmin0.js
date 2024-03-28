// middleware/isAdmin.js
function isAdmin(req, res, next) {
  // Isto é apenas um exemplo. Substitua pela sua lógica de verificação real
  if (req.user && req.user.isAdmin) {
    next();
  } else {
    res
      .status(403)
      .send(
        "Acesso negado. Apenas administradores podem aceder a esta página."
      );
  }
}
module.exports = isAdmin;
