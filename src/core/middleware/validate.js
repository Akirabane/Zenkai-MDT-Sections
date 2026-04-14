function validate(schema, source = 'body') {
  return function validator(req, res, next) {
    const result = schema.safeParse(req[source]);
    if (!result.success) {
      return res.status(400).json({
        error: result.error.issues[0].message
      });
    }

    req[source] = result.data;
    return next();
  };
}

module.exports = {
  validate
};
